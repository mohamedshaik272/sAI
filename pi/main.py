#!/usr/bin/env python3
"""
Raspberry Pi tracking script.
Detects user movement via camera and sends commands to Arduino.
"""

import cv2
import serial
import time
import os
import mediapipe as mp

SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyACM0")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
MOVEMENT_THRESHOLD = 0.02

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_lite.task")


def main():
    print(f"Connecting to Arduino on {SERIAL_PORT}...")
    ser = serial.Serial(SERIAL_PORT, 9600, timeout=1)
    time.sleep(2)
    print("Arduino connected.")

    print(f"Starting camera {CAMERA_INDEX}...")
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    landmarker = PoseLandmarker.create_from_options(options)
    cap = cv2.VideoCapture(CAMERA_INDEX)
    print("Camera started. Tracking...\n")

    smoothed_x = 0.5
    prev_x = None
    frame_ts = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            frame_ts += 33
            results = landmarker.detect_for_video(mp_image, frame_ts)

            if results.pose_landmarks:
                nose = results.pose_landmarks[0][0]
                smoothed_x = 0.7 * smoothed_x + 0.3 * nose.x

                if prev_x is not None:
                    delta = smoothed_x - prev_x
                    if delta > MOVEMENT_THRESHOLD:
                        ser.write(b'r')
                        print("-> RIGHT")
                    elif delta < -MOVEMENT_THRESHOLD:
                        ser.write(b'l')
                        print("-> LEFT")

                prev_x = smoothed_x

            time.sleep(0.1)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        cap.release()
        landmarker.close()
        ser.close()
        print("Done.")


if __name__ == "__main__":
    main()
