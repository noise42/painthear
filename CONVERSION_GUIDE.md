# The Synesthesia Composer: Image → Music Mapping Guide

The **Synesthesia Composer** is a deterministic, invertible system that translates light and color into 4-voice classical sheet music. Unlike traditional "artistic" mappings, this system follows a strict mathematical protocol that allows a musical score to be transformed back into its original visual essence without hidden metadata.

---

## 1. Grid Abstraction: The 32×32 Matrix
The process begins by reducing any image to a **32×32 pixel grid**.
- **The X-Axis (Time):** Each column represents one musical measure (in 4/4 time).
- **The Y-Axis (Harmony):** The 32 rows are divided into 4 classical voices:
  - **Soprano (Rows 0-7)**
  - **Alto (Rows 8-15)**
  - **Tenor (Rows 16-23)**
  - **Bass (Rows 24-31)**

---

## 2. The Color-to-Music Protocol
Each pixel's **HSL** (Hue, Saturation, Lightness) value is mapped to a musical property:

### **A. Pitch ↔ Hue**
The 360-degree color wheel is mapped geometrically to a voice's pitch range:
- **Red (0°/360°):** The lowest note of the voice's pitch range.
- **Green (120°):** The middle of the range.
- **Blue (240°):** The upper register.
- **Purple (300°+):** The highest brilliance.
*The pitch is snapped to the nearest note in the current scale (Major, Minor, Dorian, or Lydian).*

### **B. Velocity (Dynamics) ↔ Saturation**
The "vividness" of the color dictates how loudly the note is played:
- **Neon/Saturated Colors:** Fortissimo (loud, sharp).
- **Pastel/Muted Colors:** Pianissimo (soft, gentle).

### **C. Duration & Legato ↔ Lightness**
The brightness of the pixel determines the note's length:
- **Brilliant Pixels:** Notes are held longer (using ties and slurs).
- **Dark/Average Pixels:** Short eighth notes (staccato).

---

## 3. Harmonic Structure: Full vs. Temporary Modulations
The system analyzes the image in 8-measure blocks to provide musical consistency:
- **Full Modulations:** Every 8 measures, the "Sectional Key" is recalculated. If the overall color temperature of the painting shifts from Blue to Red, the **Key Signature** changes (e.g., from C Major to G Major).
- **Temporary Modulations (Accidentals):** If a single column has a sudden, intense "splash" of color that diverges from the section's hue, the engine creates **Accidentals** (sharps and flats) for that measure only, without Changing the key signature.

---

## 4. Musical Silence (Pauses)
A painting is not just color; it is also space.
- **Achromatic Pixels:** If a pixel has a Saturation of less than 15% (pure whites, grays, or blacks), it is mathematically encoded as a **Musical Rest**.
- This creates "breathing room" in the composition wherever the image contains empty space or gray clouds.

---

## 5. Invertible Timbre (Ensembles)
The overall "vibe" of the painting selects the instrument ensemble recorded in the MIDI file:
- **🔥 Warm (Reds/Oranges):** 🎺 **Brass Section** (Square/Sawtooth waves).
- **❄️ Cool (Blues/Greens):** 🪈 **Woodwinds** (Sine/Triangle waves).
- **🌑 Dark/Moody:** 🎻 **String Quartet** (Sawtooth/Triangle).
- **🎹 Neutral:** **Keyboards/Mallets**.

**The Loop:** When the resulting MIDI file is uploaded back into the app, the parser detects these instruments and applies a **Color Grading Filter** to the reconstructed image, restoring the original warmth or coolness.

---

## 6. The "Musical Shadow"
Because the mapping is mathematical, you can click **"Preview Musical Shadow"** to see exactly how the music interprets your painting. This is the **lossless core** of the system: the image is not stored anywhere; it is *calculated* directly from the notes you hear.
