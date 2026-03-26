# The Synesthesia Composer: Image ↔ Music Protocol (v2.0)

The **Synesthesia Composer** is a deterministic, 100% invertible system that translates visual art into 4-voice classical counterpoint. This guide documents the mathematical rules for the professional-grade **OKLch** mapping and the **Composition-Native Metadata** system.

---

## 1. Perceptual Uniformity: The OKLch Engine
Unlike standard HSL, we use the **OKLch** color space to ensure that the musical intensity perfectly matches human visual perception.

### **A. Pitch ↔ Hue (The Color Wheel)**
The 360° hue circle is mapped geometrically to each voice's specific MIDI range:
- **Red (0°/360°):** Tonic/Low register.
- **Green (120°):** Medial register.
- **Blue (240°):** High register.
- **Linear Residuals:** To ensure 100% color accuracy, the exact "Hue-to-Note" error is stored in **Pitch Bend** messages (±50 cents). This allows the reconstruction engine to restore the original hue with infinite precision.

### **B. Velocity (Dynamics) ↔ Chroma**
The "Purity" or "Vividness" of a color determines the MIDI Velocity (30–127):
- **Neon/Vibrant Colors:** Higher Chroma → High Velocity (Fortissimo).
- **Muted/Neutral Colors:** Low Chroma → Low Velocity (Pianissimo).

### **C. Rhythmic Phrasing ↔ Lightness**
We use a 4-level **Rhythmic Grammar** determined by the OKLch Lightness (L) value:
- **L ≥ 0.85:** Whole Notes (Maximum Luminous Presence).
- **L ≥ 0.70:** Half Notes.
- **L ≥ 0.45:** Quarter Notes.
- **L < 0.45:** Eighth Notes (Staccato/Detail).

---

## 2. 4-Voice Classical Architecture
The system reduces the image into a **32×32 grid** where each column represents one measure (4/4) and rows are assigned to 4 SATB voices:
- **Soprano (Rows 0-7):** MIDI 60–79 (Treble Clef).
- **Alto (Rows 8-15):** MIDI 52–72 (Treble Clef).
- **Tenor (Rows 16-23):** MIDI 45–64 (Treble-8 Clef).
- **Bass (Rows 24-31):** MIDI 36–55 (Bass Clef).

---

## 3. Harmonic Intelligence (Circle of Fifths)
The engine analyzes the image in 8-measure blocks to detect a **Sectional Key**:
- **Hue Distribution:** The "circular mean" of hues determines the key (e.g., Cool Blues → C Major/Dorian, Warm Reds → G Major).
- **Mode Selection:** Average Lightness determines if the section is **Major** (Bright) or **Minor** (Moody).
- **Voice Leading:** Notes are automatically transposed by octaves to minimize melodic leaps and maintain smooth vocal lines.

---

## 4. Inversion Assurance: The "Composition DNA"
To achieve 100% reconstruction without hidden files, all visual metadata is **encoded into the musical composition** using MIDI Control Change (CC) messages:

| Controller | Data Encoded | Purpose |
| :--- | :--- | :--- |
| **CC #85** | Voice Leading Delta | Stores octave shifts made for melodic smoothness. |
| **CC #86** | Parallel Motion Filter | Logs corrections made to prevent parallel fifths/octaves. |
| **CC #100/101** | Original Width | Reconstructs the original image's horizontal proportion. |
| **CC #102/103** | Original Height | Reconstructs the original image's vertical proportion. |
| **CC #104-106** | Background RGB | Pre-fills the reconstruction canvas with the original palette tone. |

---

## 5. Selective Silence (Pauses)
A pixel is treated as a **Musical Rest** if it meets the following "Silence Criteria":
- **L < 0.15 OR C < 0.05** (Dark or deeply desaturated regions).
- This creates professional architectural space in the score while the **CC #104-106** metadata ensures the visual reconstruction remains faithful to the original background tone.

---

## 6. The "Musical Shadow"
The **Musical Shadow** is the visual proof-of-work. By uploading a generated MIDI file, the system reads the "DNA" (CC messages and Note data) to mathematically redraw the original painting. The image is not a preview; it is the physical manifestation of the music itself.
