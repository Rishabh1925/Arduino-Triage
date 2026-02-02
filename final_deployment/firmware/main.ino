/*
  Smart Rural Triage Station - Main MCU Firmware
  ===============================================
  
  FINAL FIRMWARE: SERIAL BRIDGE EDITION with Enhanced UI
  
  This is the main firmware for the Arduino UNO Q (STM32U585 Core).
  It handles real-time sensor reading, actuator control, display output,
  and communication with the Linux side via dual serial ports.
  
  Hardware Components (Modulino QWIIC Ecosystem):
  - Modulino Knob (I2C) - Mode selection
  - Modulino Movement (I2C) - Motion detection (LSM6DSOX)
  - Modulino Thermo (I2C) - Temperature measurement
  - Modulino Buzzer (I2C) - Audio alerts
  - QLED/OLED Display 128x64 (I2C) - Visual Status
    * Connected via 4-Pin Header: GND->GND, VCC->3.3V, SDA->SDA, SCL->SCL
  - Servo Motors (D9, D10) - Visual feedback (PWM)
  - Audio Input (A1) - Microphone
  
  Communication Protocol:
  - JSON messages over Serial (USB) and Serial1 (Internal Bridge) @ 115200 baud
  
  Author: Smart Triage Team
  Version: 2.2.0 (Serial Bridge + Enhanced UI)
  License: MPL-2.0
*/

#include <ArduinoJson.h>
#include <Servo.h>
#include <Wire.h>
#include <Modulino.h>           
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ============================================================================
// CONFIGURATION AND CONSTANTS
// ============================================================================

// Display Settings
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SCREEN_ADDRESS 0x3C 

// Pin definitions
const int PIN_MIC_ANALOG = A1;  
const int PIN_LED_STATUS = 6;
const int PIN_SERVO_PROGRESS = 9;
const int PIN_SERVO_RESULT = 10;

// Timing constants
const unsigned long SENSOR_READ_INTERVAL = 100;    // 100ms between sensor reads
const unsigned long DISPLAY_UPDATE_INTERVAL = 250; // 250ms update rate

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

// Hardware Objects
Servo progressServo;
Servo resultServo;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Modulino Objects
ModulinoKnob knob;
ModulinoMovement movement;
ModulinoThermo thermo;
ModulinoBuzzer buzzer;

// Timing variables
unsigned long lastUpdate = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastMovementTime = 0;

// Sensor data structure
struct SensorData {
  int knobRawValue;
  int knobMode;           // 0=Heart, 1=Lung, 2=Calibration
  int micValue;
  float temperatureCelsius;
  bool movementDetected;
  unsigned long movementStableDuration;
};

SensorData currentSensorData;

// System state
enum SystemState {
  STATE_IDLE,
  STATE_EXAMINING,
  STATE_RESULTS
};

SystemState currentState = STATE_IDLE;

// UI State
String currentStatusMsg = "Ready";
String lastResultMsg = "";

// ============================================================================
// SETUP FUNCTION
// ============================================================================

void setup() {
  Serial.begin(115200);   // USB
  Serial1.begin(115200);  // Internal Bridge
  
  // Initialize I2C and Display
  Wire.begin();
  Modulino.begin();
  
  knob.begin();
  movement.begin();
  thermo.begin();
  buzzer.begin();

  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    // Display init failed - continue anyway
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("SmartTriage Booting...");
  display.display();
  
  // Initialize pins
  pinMode(PIN_MIC_ANALOG, INPUT);
  pinMode(PIN_LED_STATUS, OUTPUT);
  
  // Initialize Servos
  progressServo.attach(PIN_SERVO_PROGRESS);
  resultServo.attach(PIN_SERVO_RESULT);
  progressServo.write(0);  
  resultServo.write(90);
  
  // Startup sequence
  performStartupSequence();
  
  currentState = STATE_IDLE;
  currentStatusMsg = "Ready";
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  unsigned long currentTime = millis();
  
  // Listen to BOTH serial ports
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    processCommand(input);
  }
  if (Serial1.available() > 0) {
    String input = Serial1.readStringUntil('\n');
    processCommand(input);
  }

  // Read sensors and send data
  if (currentTime - lastUpdate > SENSOR_READ_INTERVAL) {
    readAllSensors();
    sendSensorData();
    lastUpdate = currentTime;
  }
  
  // Update display
  if (currentTime - lastDisplayUpdate > DISPLAY_UPDATE_INTERVAL) {
    updateDisplay();
    lastDisplayUpdate = currentTime;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

void performStartupSequence() {
  display.clearDisplay();
  display.setCursor(0,20);
  display.setTextSize(2);
  display.println("Starting...");
  display.display();
  
  // Servo Wipe
  progressServo.write(0); delay(200);
  progressServo.write(180); delay(200);
  progressServo.write(0);
  
  buzzer.tone(1000, 200);
  delay(200);
}

// ============================================================================
// SENSOR READING
// ============================================================================

void readAllSensors() {
  // Read Knob
  int k = knob.get();
  currentSensorData.knobRawValue = k;
  
  if (k < 300) {
    currentSensorData.knobMode = 0; // Heart
  } else if (k < 700) {
    currentSensorData.knobMode = 1; // Lung
  } else {
    currentSensorData.knobMode = 2; // Calibration
  }
  
  // Read Temperature
  currentSensorData.temperatureCelsius = thermo.getTemperature();
  
  // Read Movement
  float x = movement.getX();
  bool moving = (abs(x) > 1.2);
  
  if (moving) {
    currentSensorData.movementDetected = true;
    lastMovementTime = millis();
    currentSensorData.movementStableDuration = 0;
  } else {
    if (millis() - lastMovementTime > 500) {
      currentSensorData.movementDetected = false;
    }
    currentSensorData.movementStableDuration = millis() - lastMovementTime;
  }
  
  // Read Microphone
  currentSensorData.micValue = analogRead(PIN_MIC_ANALOG);
}

// ============================================================================
// DISPLAY & UI (Enhanced from first script)
// ============================================================================

void updateDisplay() {
  display.clearDisplay();
  
  // Header Bar (Inverted text for mode)
  display.setTextSize(1);
  display.setTextColor(SSD1306_BLACK, SSD1306_WHITE); // Inverted
  display.setCursor(0,0);
  String modeStr = (currentSensorData.knobMode == 0) ? " HEART MODE " : 
                   (currentSensorData.knobMode == 1) ? " LUNG MODE  " : " CALIBRATION";
  display.println(modeStr);
  
  // Main Content
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,12);
  
  if (currentState == STATE_IDLE) {
    // Temperature display
    display.print("Temp: "); 
    display.print(currentSensorData.temperatureCelsius, 1); 
    display.println(" C");
    
    // Mic level display
    display.print("Mic:  ");
    display.println(currentSensorData.micValue);
    
    // Movement status
    if(currentSensorData.movementDetected) {
      display.println(">> MOVING <<");
    } else {
      display.println(">> STABLE <<");
    }
    
  } else if (currentState == STATE_EXAMINING) {
    display.setTextSize(2);
    display.setCursor(10, 20);
    display.println("SCANNING");
    
    // Progress bar
    display.drawRect(10, 45, 108, 10, SSD1306_WHITE);
    int fill = (millis() / 250) % 20;
    display.fillRect(12, 47, fill * 5, 6, SSD1306_WHITE);
    
  } else if (currentState == STATE_RESULTS) {
    display.setTextSize(1);
    display.println("SCAN COMPLETE");
    display.println("----------------");
    display.setTextSize(2);
    display.setCursor(0, 30);
    display.println(lastResultMsg);
  }
  
  // Footer Status Bar
  display.setTextSize(1);
  display.setCursor(0, 56);
  display.print("Status: ");
  display.println(currentStatusMsg.substring(0, 10)); // Truncate if too long
  
  display.display();
}

// ============================================================================
// COMMUNICATION
// ============================================================================

void sendSensorData() {
  StaticJsonDocument<256> doc;
  
  doc["knob"] = currentSensorData.knobRawValue;
  doc["mode"] = currentSensorData.knobMode;
  doc["temp"] = currentSensorData.temperatureCelsius;
  doc["movement"] = currentSensorData.movementDetected ? 1 : 0;
  doc["stable_ms"] = currentSensorData.movementStableDuration;
  doc["mic"] = currentSensorData.micValue;

  // Send to BOTH ports
  serializeJson(doc, Serial);
  Serial.println();
  serializeJson(doc, Serial1);
  Serial1.println();
}

void processCommand(String input) {
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, input);
  if (error) return;

  // Servo control
  if (doc.containsKey("progress")) {
    int angle = doc["progress"];
    progressServo.write(angle);
  }
  if (doc.containsKey("result")) {
    int angle = doc["result"];
    resultServo.write(angle);
  }
  
  // Buzzer control
  if (doc.containsKey("buzzer")) {
    int freq = doc["buzzer"];
    if (freq > 0) buzzer.tone(freq, 100); 
  }
  
  // LED control
  if (doc.containsKey("led")) {
    digitalWrite(PIN_LED_STATUS, doc["led"].as<int>());
  }
  
  // State control
  if (doc.containsKey("state")) {
    String state = doc["state"].as<String>();
    if (state == "IDLE") {
      currentState = STATE_IDLE;
      currentStatusMsg = "Ready";
    } else if (state == "EXAMINING") {
      currentState = STATE_EXAMINING;
      currentStatusMsg = "Scanning...";
    } else if (state == "RESULTS") {
      currentState = STATE_RESULTS;
      currentStatusMsg = "Done";
    }
  }
  
  // Display text control
  if (doc.containsKey("display")) {
    String txt = doc["display"].as<String>();
    if (txt.length() > 0) {
      currentStatusMsg = txt;
    }
  }
  
  // Result message
  if (doc.containsKey("result_msg")) {
    lastResultMsg = doc["result_msg"].as<String>();
  }
}