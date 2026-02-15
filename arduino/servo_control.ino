#include <Stepper.h>

const int stepsPerRev = 2048;
Stepper stepper(stepsPerRev, 8, 10, 9, 11);

void setup() {
  stepper.setSpeed(15);
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'l') {
      stepper.step(20);
    } else if (cmd == 'r') {
      stepper.step(-20);
    }
  }
}
