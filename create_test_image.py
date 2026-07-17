from PIL import Image, ImageDraw
import random

# Create a test image with random circles (lights) and rectangles (people)
img = Image.new('RGB', (224, 224), color=(80, 80, 80))
draw = ImageDraw.Draw(img)

# Draw random circles to simulate lights
for _ in range(3):
    x = random.randint(20, 200)
    y = random.randint(20, 200)
    r = random.randint(5, 15)
    draw.ellipse([(x-r, y-r), (x+r, y+r)], fill=(255, 255, 100))

# Draw random rectangles to simulate people
for _ in range(2):
    x1 = random.randint(20, 200)
    y1 = random.randint(20, 200)
    draw.rectangle([(x1, y1), (x1+20, y1+40)], fill=(200, 100, 50))

img.save('test_image.jpg')
print('Test image created: test_image.jpg')
