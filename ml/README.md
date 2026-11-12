# ML: training, and how a model plugs into the app

This folder is where models are trained and exported. The app never depends on a model's training code: it loads a file and talks to it through a small interface, so a better model replaces an older one without touching the app.

## What the app already does, and what is left for training

| Job | Who does it today | Where a trained model goes |
|---|---|---|
| Read text on a note | Google ML Kit (Latin script) | `OcrEngine` ([ocr_engine.dart](../app/lib/features/scan/data/ocr/ocr_engine.dart)), for a custom reader |
| Say which note and side is in the frame | Nothing yet | `Classifier` ([classifier.dart](../app/lib/features/identify/domain/classifier.dart)) |
| Recognise a new currency from a few photos | Nothing yet | The same `Classifier` interface, with an embedding matcher behind it |

Text matching ("EUROPEAN CENTRAL BANK" means euro) needs no training; it is plain rules and ships in Stage 2.

## The contract for a currency classifier

Give the app **three files** with the same name stem:

```
classifier_v1.tflite        the model, INT8 quantised
classifier_v1.labels.txt    one class per line, in output order
classifier_v1.json          what the app needs to feed it correctly
```

`classifier_v1.json`:

```json
{
  "version": 1,
  "input": { "width": 224, "height": 224, "channels": 3, "layout": "NHWC",
             "range": [0, 1], "mean": [0, 0, 0], "std": [1, 1, 1] },
  "output": "softmax",
  "trained": "2026-11-12",
  "test_accuracy": 0.0,
  "dataset": "what it was trained on, in one line"
}
```

Rules that prevent the usual failures:

1. **Classes are one per side**: `EUR_20_front`, `EUR_20_back`, ... plus a `background` class, so the app can say "nothing here" instead of guessing.
2. **The preprocessing in the JSON must be exactly what training used.** "Works in Python, wrong on the phone" is almost always a mismatch here (0-1 versus 0-255, RGB versus BGR, wrong resize).
3. **Quantise to INT8 with a representative set** of about 200 real training images, then re-test the quantised file. Report both accuracies.
4. **Test on photos the model never saw**, taken with a phone camera: different light, angles, folded and worn notes, blur. Keep that test set out of training. A confusion matrix goes in `ml/reports/`.
5. **Confidence must mean something.** The app shows a result only when the same class wins in 3 of the last 5 frames above a threshold, so check that wrong answers get low scores.

## A custom text reader (later)

To replace ML Kit, implement `OcrEngine.recognize(OcrInput)`, which returns the text lines of one frame, top to bottom. `OcrInput` carries the raw camera bytes, size, row stride, rotation and pixel format. Compare it against ML Kit on the same cropped photos and adopt it only if it reads more serials correctly.

## Data and legal

- **Do not commit photos to Git.** They are large, and the rules about photographing and storing banknote images differ by country. Keep them in `data/images/` (not tracked) and check the law for each country before you collect or publish.
- Record where every image came from and which phone took it.

## Setup

A Python virtual environment is already in `ml/.venv` (not tracked). Training libraries have to match your Python version, so check each one's support before installing.

When a model and its two small files are ready, put them here and tell me. Loading the model, wiring it into the scan screen and testing it is my part.
