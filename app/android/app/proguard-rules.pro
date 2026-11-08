# Release builds shrink the app with R8, which stops on classes it cannot find.
#
# Only the Latin text recogniser is bundled (see MlKitOcrEngine). The ML Kit
# Flutter plugin also refers to the Chinese, Devanagari, Japanese and Korean
# recognisers, which are separate libraries we do not include. They are never
# called, so the warnings are safe to ignore.
#
# If one of those scripts is ever added, add its ML Kit dependency to
# build.gradle.kts and delete the matching line here.
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.japanese.**
-dontwarn com.google.mlkit.vision.text.korean.**
