#!/usr/bin/env python3
"""
Demo script showing how to use the enhanced tracking module.
Demonstrates movement detection and frame boundary warnings.
"""

import tracking
import time
import cv2


def select_camera() -> int:
    """Detect available cameras and let the user pick one."""
    print("\nDetecting cameras...")
    available = []
    for i in range(10):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            name = cap.getBackendName()
            available.append((i, name))
            cap.release()
        else:
            cap.release()

    if not available:
        print("No cameras found!")
        exit(1)

    if len(available) == 1:
        idx, name = available[0]
        print(f"Found 1 camera: index {idx} ({name})")
        return idx

    print(f"Found {len(available)} cameras:\n")
    for i, (idx, name) in enumerate(available, 1):
        print(f"  {i}. Camera {idx} ({name})")

    while True:
        pick = input(f"\nSelect camera (1-{len(available)}): ").strip()
        if pick.isdigit() and 1 <= int(pick) <= len(available):
            return available[int(pick) - 1][0]
        print("Invalid choice, try again.")

def demo_movement_tracking(camera_index: int = 0):
    """Demonstrate movement direction detection"""
    print("=== Movement Tracking Demo ===")
    print("Starting camera... Move left, right, up, or down to see detection.\n")

    tracking.start(camera_index=camera_index, movement_threshold=0.015)
    
    try:
        for i in range(50):  # Run for 50 frames
            h_dir, v_dir = tracking.get_movement_direction()
            
            if h_dir or v_dir:
                msg = f"Frame {i}: "
                if h_dir:
                    msg += f"Horizontal: {h_dir.value} "
                if v_dir:
                    msg += f"Vertical: {v_dir.value}"
                print(msg)
            
            time.sleep(0.1)  # 10 FPS
            
    finally:
        tracking.stop()
        print("\nMovement tracking demo complete.\n")


def demo_frame_warnings(camera_index: int = 0):
    """Demonstrate frame boundary detection and warnings"""
    print("=== Frame Boundary Detection Demo ===")
    print("Starting camera... Move near the edges to trigger warnings.\n")

    tracking.start(camera_index=camera_index, frame_margin=0.15, warning_cooldown=2.0)
    
    try:
        for i in range(100):  # Run for 100 frames
            status, warning = tracking.check_frame_status()
            
            if warning:
                print(f"[{status.value}] {warning}")
            elif i % 20 == 0:  # Status update every 20 frames
                print(f"Frame {i}: Status: {status.value}")
            
            time.sleep(0.1)  # 10 FPS
            
    finally:
        tracking.stop()
        print("\nFrame boundary demo complete.\n")


def demo_full_tracking(camera_index: int = 0):
    """Demonstrate comprehensive tracking with all features"""
    print("=== Full Tracking Demo ===")
    print("Starting camera... This combines all features.\n")

    tracking.start(camera_index=camera_index)
    
    try:
        for i in range(100):
            data = tracking.get_full_tracking_data()
            
            # Print warnings immediately
            if data['warning']:
                print(f"\n{data['warning']}")
            
            # Print status every 10 frames
            if i % 10 == 0:
                print(f"\nFrame {i}:")
                print(f"  Position: {data['position']}")
                print(f"  Movement: H={data['movement'][0].value if data['movement'][0] else 'None'}, "
                      f"V={data['movement'][1].value if data['movement'][1] else 'None'}")
                print(f"  Frame Status: {data['frame_status'].value}")
                print(f"  Servo Angle: {data['servo_angle']}°")
            
            time.sleep(0.1)  # 10 FPS
            
    finally:
        tracking.stop()
        print("\nFull tracking demo complete.\n")


def demo_signal_based_control(camera_index: int = 0):
    """Demonstrate sending signals based on movement direction"""
    print("=== Signal-Based Control Demo ===")
    print("Starting camera... Movement will trigger simulated control signals.\n")

    tracking.start(camera_index=camera_index, movement_threshold=0.02)
    
    try:
        for i in range(100):
            h_dir, v_dir = tracking.get_movement_direction()
            
            # Send signals based on movement
            if h_dir == tracking.MovementDirection.LEFT:
                print(f"→ SIGNAL: Turn servo LEFT")
            elif h_dir == tracking.MovementDirection.RIGHT:
                print(f"→ SIGNAL: Turn servo RIGHT")
            
            if v_dir == tracking.MovementDirection.UP:
                print(f"↑ SIGNAL: Tilt UP")
            elif v_dir == tracking.MovementDirection.DOWN:
                print(f"↓ SIGNAL: Tilt DOWN")
            
            time.sleep(0.1)  # 10 FPS
            
    finally:
        tracking.stop()
        print("\nSignal-based control demo complete.\n")


if __name__ == "__main__":
    print("Enhanced Tracking Module Demo")
    print("=" * 50)

    cam = select_camera()

    print("\nChoose a demo to run:\n")
    print("1. Movement Tracking")
    print("2. Frame Boundary Warnings")
    print("3. Full Tracking (All Features)")
    print("4. Signal-Based Control")
    print("5. Run All Demos")

    choice = input("\nEnter choice (1-5): ").strip()

    if choice == "1":
        demo_movement_tracking(cam)
    elif choice == "2":
        demo_frame_warnings(cam)
    elif choice == "3":
        demo_full_tracking(cam)
    elif choice == "4":
        demo_signal_based_control(cam)
    elif choice == "5":
        demo_movement_tracking(cam)
        demo_frame_warnings(cam)
        demo_full_tracking(cam)
        demo_signal_based_control(cam)
    else:
        print("Invalid choice. Exiting.")