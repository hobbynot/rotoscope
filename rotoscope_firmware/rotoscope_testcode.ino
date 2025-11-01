#include <Arduino_FreeRTOS.h>
#include <Queue.h>
#include <semphr.h>

#define DIR_PIN 2
#define STEP_PIN 3
#define ENABLE_PIN 4
#define LIMIT_START 5
#define LIMIT_END 6
#define ENCODER_A 18
#define ENCODER_B 19
#define PPR 360

volatile long encoderTicks = 0;
long savedPositions[10];          // max 10 positions
bool savedFlags[10] = { false };  // Track which slots are valid
int stepDelay = 300;              // microseconds per step

QueueHandle_t commandQueue;
SemaphoreHandle_t xEncoderMutex;

void readEncoder() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;

  bool A = digitalRead(ENCODER_A);
  bool B = digitalRead(ENCODER_B);

  xSemaphoreTakeFromISR(xEncoderMutex, &xHigherPriorityTaskWoken);
  if (A == B) {
    encoderTicks++;  // Forward
  } else {
    encoderTicks--;  // Backward
  }
  xSemaphoreGiveFromISR(xEncoderMutex, &xHigherPriorityTaskWoken);
}

// ------------------- TASKS ------------------- //

void Task_EncoderReader(void *pvParameters) {
  long tickCopy;
  float rotations;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(1000));  // Every 1 second

    xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
    tickCopy = encoderTicks;
    xSemaphoreGive(xEncoderMutex);

    rotations = tickCopy / (float)PPR;

    Serial.print("Total Rotations: ");
    Serial.println(rotations, 2);  // 2 decimal places
  }
}

void Task_SerialHandler(void *pvParameters) {
  char buffer[64];
  int index = 0;

  for (;;) {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        buffer[index] = '\0';
        xQueueSend(commandQueue, &buffer, 0);
        index = 0;
      } else {
        buffer[index++] = c;
        if (index >= 63) index = 0;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void Task_CommandProcessor(void *pvParameters) {
  char cmd[64];

  for (;;) {
    if (xQueueReceive(commandQueue, &cmd, portMAX_DELAY)) {
      if (strcmp(cmd, "HOME") == 0) {
        homeMachine();
      } else if (strncmp(cmd, "MOVE:", 5) == 0) {
        long target = atol(cmd + 5);
        moveTo(target);
      } else if (strncmp(cmd, "SAVE:", 5) == 0) {
        int slot = atoi(cmd + 5);
        if (slot >= 0 && slot < 10) {
          // Thread-safe encoder reading
          long currentPos;
          xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
          currentPos = encoderTicks;
          xSemaphoreGive(xEncoderMutex);
          
          savedPositions[slot] = currentPos;
          savedFlags[slot] = true;
          Serial.print("Saved at position: ");
          Serial.println(savedPositions[slot]);
        } else {
          Serial.println("Invalid slot. Use 0-9");
        }
      } else if (strncmp(cmd, "GOTO:", 5) == 0) {
        int slot = atoi(cmd + 5);
        if (slot >= 0 && slot < 10) {
          if (savedFlags[slot]) {
            moveTo(savedPositions[slot]);
          } else {
            Serial.print("Error: Slot ");
            Serial.print(slot);
            Serial.println(" is empty. Save it first.");
          }
        } else {
          Serial.println("Invalid slot. Use 0-9");
        }
      } else if (strcmp(cmd, "POS?") == 0) {
        // Thread-safe encoder reading
        long currentPos;
        xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
        currentPos = encoderTicks;
        xSemaphoreGive(xEncoderMutex);
        
        Serial.print("POS:");
        Serial.println(currentPos);
      } else if (strcmp(cmd, "LIST") == 0) {
        for (int i = 0; i < 10; i++) {
          Serial.print("POS ");
          Serial.print(i);
          Serial.print(": ");
          if (savedFlags[i]) {
            Serial.println(savedPositions[i]);
          } else {
            Serial.println("EMPTY");
          }
        }
      } else if (strcmp(cmd, "TEST") == 0) {
        testDirection();  // Manual test command
      } else {
        Serial.println("Unknown Command");
      }
    }
  }
}

void Task_PositionBroadcaster(void *pvParameters) {
  for (;;) {
    // Thread-safe encoder reading
    long currentPos;
    xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
    currentPos = encoderTicks;
    xSemaphoreGive(xEncoderMutex);
    Serial.print("POS:");
    Serial.println(currentPos);
    // vTaskDelay(500);  // every 0.5 seconds
    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

// ------------------- UTILITY FUNCTIONS ------------------- //

void homeMachine() {
  Serial.println("Starting Homing...");

  const int MAX_HOMING_STEPS = 3200;
  int steps = 0;

  // Step toward the limit until switch triggers (LOW)
  while (digitalRead(LIMIT_START) == HIGH && steps < MAX_HOMING_STEPS) {
    stepMotor(-1);  // move toward home
    steps++;
    delay(1);  // small delay to avoid missed reads
  }

  // Safety check: if not triggered, exit
  if (steps >= MAX_HOMING_STEPS) {
    Serial.println("ERROR: Homing limit not found.");
    return;
  }

  Serial.println("Switch hit. Backing off...");

  // Bounce back until the switch is released
  steps = 0;
  while (digitalRead(LIMIT_START) == LOW && steps < 100) {
    stepMotor(1);  // move away from switch
    steps++;
    delay(1);
  }

  // Thread-safe encoder reset
  xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
  encoderTicks = 0;
  xSemaphoreGive(xEncoderMutex);
  
  Serial.println("Homing complete.");
}

void moveTo(long target) {
  Serial.print("Moving to position: ");
  Serial.println(target);

  long currentPos;
  int stepCount = 0;
  const long MAX_STEPS = 100000;  // Safety limit
  const int TOLERANCE = 5;      // Allow ±1 encoder count accuracy

  // Get initial position
  xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
  currentPos = encoderTicks;
  xSemaphoreGive(xEncoderMutex);

  // Keep stepping until we're within tolerance or hit safety limit
  while (abs(currentPos - target) > TOLERANCE && stepCount < MAX_STEPS) {
    
    // Determine direction
    int dir = (target > currentPos) ? 1 : -1;
    
    // Take one step
    stepMotor(dir);
    stepCount++;
    
    // Check position every 5 steps
    if (stepCount % 5 == 0) {
      xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
      currentPos = encoderTicks;
      xSemaphoreGive(xEncoderMutex);
    }
        if (stepCount % 10 == 0) {
      vTaskDelay(pdMS_TO_TICKS(1));  // Delay 1 tick (~1-10 ms depending on config)
    }
  }

  // Final position check
  xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
  currentPos = encoderTicks;
  xSemaphoreGive(xEncoderMutex);

  if (abs(currentPos - target) <= TOLERANCE) {
    Serial.print("Successfully reached position: ");
    Serial.print(currentPos);
    Serial.print(" (target: ");
    Serial.print(target);
    Serial.print(", took ");
    Serial.print(stepCount);
    Serial.println(" steps)");
  } else {
    Serial.print("Movement incomplete! Final: ");
    Serial.print(currentPos);
    Serial.print(", Target: ");
    Serial.println(target);
  }
}


void stepMotor(int dir) {
  // Check limits before stepping
  if (dir > 0 && digitalRead(LIMIT_END) == LOW) {
    Serial.println("ERROR: End limit reached!");
    return;
  }
  if (dir < 0 && digitalRead(LIMIT_START) == LOW) {
    Serial.println("ERROR: Start limit reached!");
    return;
  }
  
  digitalWrite(DIR_PIN, dir > 0 ? HIGH : LOW);
  digitalWrite(STEP_PIN, HIGH);
  delayMicroseconds(stepDelay);
  digitalWrite(STEP_PIN, LOW);
  delayMicroseconds(stepDelay);
}

// ------------------- TESTING FUNCTIONS ------------------- //

void testDirection() {
  Serial.println("=== DIRECTION TEST START ===");
  
  long startPos;
  xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
  startPos = encoderTicks;
  xSemaphoreGive(xEncoderMutex);
  
  Serial.print("Start position: ");
  Serial.println(startPos);
  
  Serial.println("Moving 100 steps in dir=1");
  for(int i = 0; i < 100; i++) {
    stepMotor(1);
    delay(5);
  }
  
  long pos1;
  xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
  pos1 = encoderTicks;
  xSemaphoreGive(xEncoderMutex);
  
  Serial.print("After dir=1: ");
  Serial.println(pos1);
  Serial.print("Change: ");
  Serial.println(pos1 - startPos);
  
  delay(1000);
  
  Serial.println("Moving 100 steps in dir=-1");  
  for(int i = 0; i < 100; i++) {
    stepMotor(-1);
    delay(5);
  }
  
  long pos2;
  xSemaphoreTake(xEncoderMutex, portMAX_DELAY);
  pos2 = encoderTicks;
  xSemaphoreGive(xEncoderMutex);
  
  Serial.print("After dir=-1: ");
  Serial.println(pos2);
  Serial.print("Change: ");
  Serial.println(pos2 - pos1);
  
  Serial.println("=== DIRECTION TEST END ===");
}

// ------------------- SETUP ------------------- //

void setup() {
  Serial.begin(115200);
  
  // Pin configurations
  pinMode(DIR_PIN, OUTPUT);
  pinMode(STEP_PIN, OUTPUT);
  pinMode(ENABLE_PIN, OUTPUT);        // ✅ FIXED: Added ENABLE pin setup
  pinMode(LIMIT_START, INPUT_PULLUP);
  pinMode(LIMIT_END, INPUT_PULLUP);
  pinMode(ENCODER_A, INPUT_PULLUP);
  pinMode(ENCODER_B, INPUT_PULLUP);
  
  // Enable the stepper driver
  digitalWrite(ENABLE_PIN, LOW);      // ✅ FIXED: Enable driver (check your driver datasheet)
  
  // Create mutex for thread safety
  xEncoderMutex = xSemaphoreCreateMutex();
  if (xEncoderMutex == NULL) {
    Serial.println("Mutex creation failed!");
    while (1);
  }

  // ✅ FIXED: Changed from RISING to CHANGE to catch all transitions
  attachInterrupt(digitalPinToInterrupt(ENCODER_A), readEncoder, CHANGE);

  // Create command queue
  commandQueue = xQueueCreate(5, sizeof(char[64]));

  // Create FreeRTOS tasks
  xTaskCreate(Task_EncoderReader, "Encoder", 128, NULL, 1, NULL);
  xTaskCreate(Task_SerialHandler, "Serial", 256, NULL, 2, NULL);
  xTaskCreate(Task_CommandProcessor, "CmdProc", 256, NULL, 3, NULL);
  xTaskCreate(Task_PositionBroadcaster, "PosBroad", 128, NULL, 1, NULL);
  
  Serial.println("Rotoscope Firmware Ready!");
  Serial.println("Commands: HOME, MOVE:x, SAVE:n, GOTO:n, POS?, LIST, TEST");
  
  // ✅ FIXED: Removed automatic testDirection() call
}

void loop() {
  // FreeRTOS handles everything
}
