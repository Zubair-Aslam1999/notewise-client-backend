# analyze_id_card.py

import cv2
import pytesseract
from PIL import Image, ImageChops, ImageEnhance
import numpy as np
import sys
import os

# ---------- Blur Detection ----------
def is_blurry(image, threshold=100.0):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    return variance < threshold, variance

# ---------- OCR Text Extraction ----------
def extract_text(image_path):
    text = pytesseract.image_to_string(Image.open(image_path))
    return text

# ---------- ELA Tampering Detection ----------
def perform_ela(image_path, quality=95):
    original = Image.open(image_path).convert("RGB")
    temp_path = image_path + ".resaved.jpg"
    original.save(temp_path, "JPEG", quality=quality)
    resaved = Image.open(temp_path)

    ela_image = ImageChops.difference(original, resaved)
    extrema = ela_image.getextrema()
    max_diff = max([ex[1] for ex in extrema])
    ela_image = ImageEnhance.Brightness(ela_image).enhance(255.0 / max_diff if max_diff != 0 else 1)
    os.remove(temp_path)
    return ela_image, max_diff

# ---------- Main Entry ----------
def analyze_card(image_path):
    img = cv2.imread(image_path)

    # 1. Blur check
    blurry, variance = is_blurry(img)

    # 2. OCR text
    text = extract_text(image_path)

    # 3. ELA tampering check
    ela_image, max_diff = perform_ela(image_path)
    ela_score = max_diff

    # Print results
    print("✅ OCR Text Extracted:")
    print(text.strip())
    print("\n📷 Blurry:", blurry, "(Variance:", variance, ")")
    print("🕵️ Tamper Score (ELA):", ela_score)

    # Optional: save ELA image to view differences
    ela_image.save("ela_output.jpg")

    # Return summary for backend use
    return {
        "blurry": blurry,
        "variance": variance,
        "ocrText": text.strip(),
        "elaScore": ela_score
    }

# Run from terminal
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("❌ Usage: python analyze_id_card.py path/to/image.jpg")
        sys.exit(1)

    image_path = sys.argv[1]
    result = analyze_card(image_path)
    print("\n📊 Summary:", result)
