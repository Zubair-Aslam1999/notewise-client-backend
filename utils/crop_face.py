import cv2
import sys
import os
import uuid
import pathlib
from PIL import Image, ExifTags
import numpy as np

def detect_face(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, 1.2, 5)
    return faces

def rotate_image(image, angle):
    if angle == 0:
        return image
    elif angle == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    elif angle == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    elif angle == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)

def main():
    if len(sys.argv) < 2:
        print("usage: crop_face.py path/to/image", file=sys.stderr)
        sys.exit(1)

    img_path = pathlib.Path(sys.argv[1])
    pil_image = Image.open(img_path).convert("RGB")

    orientations = [0, 90, 180, 270]

    for angle in orientations:
        rotated_image = pil_image.rotate(angle, expand=True)
        img = cv2.cvtColor(np.array(rotated_image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        faces = cascade.detectMultiScale(gray, 1.2, 5)

        if len(faces) > 0:
            faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
            x, y, w, h = faces[0]

            pad = int(0.35 * h)
            shift = int(0.1 * h)
            y1 = max(0, y - pad - shift)
            y2 = min(img.shape[0], y + h + pad - shift)
            x1 = max(0, x - pad)
            x2 = min(img.shape[1], x + w + pad)

            face = img[y1:y2, x1:x2]
            out = img_path.with_name(f"{img_path.stem}-avatar-{uuid.uuid4().hex}.jpg")
            cv2.imwrite(str(out), face, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

            print(str(out.resolve()))
            print(f"✅ Saved cropped face at angle {angle}° to {out}", file=sys.stderr)
            sys.exit(0)

    print("NO_FACE")
    sys.exit(1)

if __name__ == "__main__":
    main()
