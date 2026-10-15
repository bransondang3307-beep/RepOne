# RepOne — Source of Truth

> **Canonical project context for ChatGPT, Claude Code, Codex, Gemini, and human collaborators.**
> Version: 1.0 | Updated: 2026-10-15 | Status: Planning + initial prototyping
>
> **Authority:** This document records the current project direction, not proof that features are implemented. When repository code, tests, and this document conflict, investigate and report the discrepancy before changing behavior. User-approved decisions supersede this file; update this file when decisions change.

## 1. Mission

**RepOne** is a modular personal motion and activity intelligence platform. A small, repositionable sensor captures movement; software translates signals into useful metrics; an AI assistant explains trends and answers personalized questions with evidence and uncertainty.

**First wedge:** affordable, low-friction automatic repetition tracking on compatible gym machines. **Long-term expansion:** wearable ankle/foot tracking for walking/running and other motion applications. The product should minimize repeated manual logging while preserving user control and privacy.

### Product principles
1. Reliable measurements before flashy AI features.
2. Minimize user friction: setup once, reuse calibration and routine context.
3. Separate directly measured signals, algorithmically derived metrics, and estimates.
4. Never claim the IMU measures resistance, calories, GPS pace, or elevation directly.
5. Keep one hardware platform with modular activity-specific software where practical.
6. Validate feasibility, safety, accuracy, customer demand, and economics before scale.

## 2. Status: verified, planned, and unresolved

| Area | Current state | Confidence |
|---|---|---|
| Arduino-based proof of concept | User owns ELEGOO Uno R3 starter kit; kit listing includes GY-521 MPU-6050 IMU, breadboard, wires, USB | Kit listing; physically verify parts |
| Live IMU data | **Not yet confirmed working** | Not implemented |
| Rep-counting algorithm | Planned, not validated | Hypothesis |
| Full/partial rep classification | Planned; especially difficult for linear ROM | Research risk |
| Bluetooth / battery device | Later hardware revision | Planned |
| Machine memory / routine prediction | Software product direction | Planned |
| Automatic weight detection | **Unsolved** | Open problem |
| Ankle/foot gait mode | Approved long-term direction | Planned |
| AI insights | Approved long-term direction; evidence-based and privacy-aware | Planned |
| Strong/Ladder write-back | No verified public per-set write API | Unverified partnership dependency |
| Price target | Hypothesis: $29.99–$39.99 retail | Not market-validated |
| Manufacturing costs | Early illustrative estimates only | No quotes |

**Do not imply a working prototype, customers, patents, partnerships, measured accuracy, or manufacturing readiness.**

## 3. User experiences

### 3.1 Gym mode — first product
- Register a gym and specific machine/exercise.
- Save a mounting reference photo, motion type, calibration, previous resistance, and workout history.
- Attach sensor to an appropriate moving part of a **controlled, unloaded test rig initially**; commercial gym attachment requires permission and safety review.
- Count movement cycles; distinguish full vs partial reps when supported by validated calibration.
- Automatically suggest next planned exercise and preload remembered machine profile, allowing skip/reorder/correction.
- One sensor cannot track two independent arms simultaneously; move it between arms or use more sensors later.
- Weight/resistance initially comes from user-confirmed remembered values or optional phone photo; **never represent remembered weight as measured**.

### 3.2 Wearable gait mode — future expansion
- Attach sensor using a secure, comfortable ankle/foot mounting system.
- Candidate IMU-derived metrics: steps, cadence, stride time; ground-contact timing with placement-specific validated algorithms.
- Stride length and pace are estimates unless validated against reference data; outdoor pace can use phone GPS with explicit permission.
- Elevation gain requires phone/barometer/GPS or another suitable source; IMU alone is insufficient.
- Energy expenditure is a model-based estimate, not a direct IMU measurement.
- Do not provide medical diagnoses or assert biomechanical quality from unvalidated metrics.

### 3.3 RepOne Intelligence — future software layer
- Explain personal trends and changes in ordinary language.
- Answer questions about recorded workouts/runs using cited session metrics, timestamps, provenance, and uncertainty.
- Label sample/demo numbers as synthetic.
- Avoid invented measurements, unwarranted health claims, or prescriptive exercise intensity advice.
- Default to privacy-minimizing storage, explicit consent for connected data, and user export/deletion capabilities.

## 4. Hardware roadmap

### H0: Wired bench prototype — **now**
- **Board:** ELEGOO/Arduino Uno R3 (user-owned).
- **IMU:** GY-521 / MPU-6050 (expected in kit; verify physically).
- **Connections on typical Uno + 5V-compatible GY-521 breakout:** Uno 5V→VCC, GND→GND, A4→SDA, A5→SCL. Confirm actual breakout voltage specifications before power; disconnect USB when wiring.
- **Transport:** USB serial to computer; no BLE required.
- **Software:** Arduino IDE firmware for timestamped sensor streaming; Python for logging, plotting, algorithms, and validation.
- **Test mechanism:** controlled, unloaded, repeatable motion rig. Never attach unreviewed prototypes to operational gym machinery.

### H1: Wireless development prototype — after H0 evidence
- Candidate: Seeed Studio XIAO nRF52840 Sense (BLE + onboard 6-axis IMU); not yet purchased.
- Evaluate sample rate, battery life, BLE packet loss, calibration persistence, form factor, attachment, and electrical safety.
- USB-first and battery-later; battery compatibility, polarity, protection, and charging require verification.

### H2: Custom production electronics — much later
- Candidate BLE SoC + 6-axis IMU, rechargeable battery, enclosure, mounting, test fixture.
- No custom PCB or 100-unit component order until bench performance and customer demand are validated.
- RF compliance, battery safety, tooling, QC, packaging, warranties, fulfillment, and returns affect real unit economics.

## 5. Core software architecture (proposed, not implemented)

```text
Firmware / Sensor Source
  -> timestamped 3-axis acceleration + 3-axis angular velocity
  -> Transport Adapter (USB serial now; BLE later)
  -> Session Capture + Raw Data Store
  -> Calibration + Signal Quality
  -> Activity-Specific Detectors
       - Gym: repetition state machine / motion excursion
       - Gait: step/stride event detection
  -> Derived Metrics + Confidence + Provenance
  -> Machine / Wearable Profiles + Session History
  -> App UI / Routine Engine
  -> AI Insight Layer (read-only analytical context first)
```

### Engineering constraints
- Treat time synchronization, orientation, mounting shifts, drift, noise, and missing samples as first-class issues.
- Gyroscope can support rotating mechanisms; double integration of acceleration to linear displacement drifts quickly.
- Prefer interpretable filtering and finite-state machines before ML.
- Every metric should record algorithm version, units, source, calibration, and confidence/quality flags.
- Separate data ingestion from algorithms so the same test recordings can be replayed reproducibly.
- Build against controlled, manually labeled ground truth; report failure cases, not only average accuracy.

## 6. Suggested repository layout

```text
repone/
  REPONE_SOURCE_OF_TRUTH.md     # This file: project-level contract
  README.md                     # Quick start and actual working state
  AGENTS.md                     # Short instructions directing all agents here
  docs/
    decisions/                 # Dated architecture decision records (ADRs)
    experiments/               # Protocols and results
    hardware/                  # Pinouts, BOM, safety notes
    product/                   # UX, requirements, roadmap
  firmware/
    uno_imu_stream/             # H0 Arduino sketch
  software/
    capture/                    # Serial/BLE adapters, recording
    processing/                 # Calibration, filters, detectors
    app/                        # UI, profiles, routines
    ai/                         # Insight prompts and evidence schemas
  data/
    samples/                    # Small synthetic or permission-safe samples
  tests/
    fixtures/                   # Labeled, reproducible traces
  scripts/
```

This is a **suggested structure**, not a claim that these folders already exist. If a repository already exists, inspect it before proposing migrations.

## 7. Data contracts (initial proposal)

Raw sensor sample:
```json
{
  "timestamp_ms": 123456,
  "source_id": "uno-gy521-01",
  "accel_m_s2": [0.0, 0.0, 9.81],
  "gyro_rad_s": [0.0, 0.0, 0.0],
  "quality_flags": []
}
```

Derived event:
```json
{
  "session_id": "example-session",
  "activity_type": "gym",
  "event_type": "rep_completed",
  "timestamp_ms": 123456,
  "value": 1,
  "classification": "full",
  "confidence": null,
  "calibration_id": "example-calibration",
  "algorithm_version": "prototype-0.1",
  "provenance": "imu_algorithm"
}
```

These are **design examples, not established APIs**. Units must be explicit and raw sensor calibration must be documented. Do not manufacture confidence values; use null until calibrated.

## 8. Milestones and exit criteria

| Phase | Deliverable | Exit gate |
|---|---|---|
| H0-A: 1 session | Arduino communicates with GY-521 | Timestamped six-axis values change appropriately with movement |
| H0-B: week 1 | Record, visualize, and label movement | Reproducible dataset with controlled movement and pauses |
| H0-C: week 2 | Baseline full-rep detector | Evaluate against labeled trials, report precision/recall and false positives |
| H0-D: week 3 | Calibration + partial-movement experiments | Report accuracy separately for rotation vs translation; quantify limitations |
| H0-E: week 4 | Wired demonstration + dashboard | Repeatable 20-minute session and documented test results |
| H1: weeks 5–6 (conditional) | Wireless feasibility test | Compare to wired baseline; document BLE reliability and battery constraints |

Timing is **an estimate** assuming roughly 5–7 hours/week, not a hard deadline. Targets such as >=95% full-rep agreement and >=90% partial-rep agreement are **aspirational test criteria**, not current results. Pause advancement if foundational accuracy is inadequate.

## 9. Business and market context

- RepOne is **not the first attachable workout motion sensor concept**.
- Companies/products to investigate: Isometrics Fitness (isometricsfitness.com), Incite (tryincite.net), LifeSync Tag (lifesyncfitness.com), GymAware FLEX (gymaware.com). Marketing claims are not independent validation.
- Differentiation hypothesis: seamless machine memory + routine-aware workflow + affordable hardware + honest, useful AI insights + eventual modular wearable use.
- $29.99–$39.99 retail is a **price hypothesis**, not established willingness-to-pay.
- A prior ~$15–$16/device factory estimate at scale was **illustrative only**, excluding many costs; obtain actual supplier quotes later.
- Strong user-authorized CSV export may support importing workout history into RepOne; do not promise bidirectional Strong/Ladder sync without confirmed APIs or agreements.
- Before commercialization: customer interviews, attachment safety, IP/freedom-to-operate review, data protection, and full unit economics.

## 10. Agent collaboration protocol

### All agents MUST
1. Read this document and the actual repository state before proposing or implementing changes.
2. Distinguish **implemented / verified / planned / speculative** in every handoff.
3. Make small, testable changes with explicit acceptance criteria.
4. Do not claim tests passed unless executed; report commands, outputs, and environment limits.
5. Do not change architecture, hardware assumptions, sensor units, or data contracts silently.
6. Add/update an ADR for consequential design changes; update this source of truth only after user approval.
7. Avoid committing secrets, API keys, personal health data, or identifying gym photos.
8. Do not imply AI-generated analysis is a physical measurement.
9. Respect gym equipment safety; prototype on controlled unloaded rigs first.
10. End work with a concise handoff: **what changed, files changed, tests run/results, open questions, recommended next task**.

### Suggested responsibilities (not exclusive)
- **Claude Code:** multi-file implementation, architecture, code organization, refactoring.
- **Codex:** targeted coding tasks, tests, debugging, implementation review.
- **Gemini:** independent design critique, sensor research, alternative algorithms, multimodal analysis when appropriate.
- **ChatGPT:** product decisions, requirements, experiment design, synthesis, prioritization, agent coordination.

No agent is the sole authority on truth. Prefer repository tests and measured experiments over model confidence. Parallelize only independent tasks; assign file ownership to avoid conflicting edits.

### Standard handoff template
```markdown
## RepOne Agent Handoff
- Objective:
- Current branch / commit:
- Status: implemented | verified | proposed | blocked
- Files modified:
- Design decisions / ADR links:
- Tests executed and exact results:
- Known limitations / risks:
- Next recommended task:
- Questions needing owner approval:
```

## 11. Immediate next action

**Hardware:** locate Uno R3, GY-521, USB cable, breadboard and jumper wires; verify the sensor's actual pin markings and supply specifications; run an I²C scanner; then stream timestamped raw IMU samples to the computer.

**Software (can proceed in parallel):** create a replayable data-ingestion interface and test fixtures with synthetic labeled movement traces. Avoid building full AI coaching, app integrations, or speculative weight detection before the sensor pipeline is proven.

## 12. Open decisions

1. Actual board/module versions and confirmed GY-521 presence.
2. Firmware sampling frequency and serial packet schema.
3. First test rig geometry (prefer controlled rotational movement).
4. Initial app stack/platform and repo status; verify existing work before scaffolding.
5. Data privacy defaults and any connected health/activity data permissions.
6. Which metrics earn a user-facing accuracy claim based on measured validation.
7. Whether a single physical sensor and attachment design can support both machine and ankle use safely and comfortably.

---

**Change control:** Treat this as a living product/engineering specification. When a decision changes, update its status and rationale here, record a dated ADR if consequential, and notify the other agents through the next handoff. Avoid divergent copies across agent-specific prompts.
