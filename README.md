

# Smart Rural Triage Station

[![Arduino](https://img.shields.io/badge/Arduino-UNO%20Q-00979D?style=for-the-badge&logo=arduino&logoColor=white)](https://www.arduino.cc/)
[![AI](https://img.shields.io/badge/AI-TensorFlow%20Lite-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/lite)
[![Privacy](https://img.shields.io/badge/Privacy-First-4CAF50?style=for-the-badge&logo=shield&logoColor=white)](#privacy--security)

**Privacy-First AI-Powered Medical Screening Device for Rural Healthcare**

Built for Arduino x Qualcomm AI for All Hackathon 2025  
*Empowering rural healthcare through privacy-first edge AI*

---

## Project Overview

The Smart Rural Triage Station is an offline, multi-modal AI device that helps nurses in rural clinics quickly identify heart and lung abnormalities. Built on Arduino UNO Q with TinyML, it provides instant "red flag" screening without storing patient data or requiring internet connectivity.

### Key Features

- **Multi-Modal Analysis**: Combines heart/lung sounds, temperature, movement detection, and positioning validation
- **100% Privacy**: No audio storage, no cloud dependency, all processing on-device
- **Explainable AI**: Shows why it flagged something with confidence scores and visual highlights
- **Nurse-Friendly**: Physical knob interface, servo animations, clear visual/audio feedback
- **Device Calibration**: Adapts to specific hardware setup for improved accuracy
- **Offline Operation**: Works completely without internet connectivity

---

## Unique Winning Angles

1. **Multi-Sensor Fusion**: Unlike single-sensor solutions, reduces false positives through sensor combination
2. **Device-Aware Calibration**: Solves inter-device variability problem with on-site adaptation
3. **Edge Explainability**: Real-time reasoning display for clinical trust
4. **Rural-First Design**: Works offline, low-power, robust hardware
5. **Scalable Architecture**: Can expand to additional screening modules

---

## Hardware Components

### From Arduino x Qualcomm Kit:
- **Arduino UNO Q** (2GB RAM, 8GB eMMC) - Main compute platform
- **Logitech Brio 100** - Positioning guidance camera
- **Modulino Sensors**: Movement, distance, thermo, knob, buzzer, relay
- **2x Servo Motors** - Visual feedback and progress indication
- **Jumper Wires** - System connections

---

## System Architecture

### Dual-Core Design:
```
Arduino UNO Q
├── Linux Side (QRB2210)
│   ├── Audio Processing & AI Inference
│   ├── Web Interface & Visualization
│   ├── Camera Handling & Positioning
│   └── System Coordination
└── MCU Side (STM32U585)
    ├── Real-time Sensor Polling
    ├── Actuator Control (Servos, Buzzer)
    ├── Safety Monitoring
    └── Hardware I/O Management
```

### AI Pipeline:
1. **Audio Capture**: Contact microphone → preprocessing → feature extraction
2. **ML Inference**: TensorFlow Lite quantized models for heart/lung classification
3. **Sensor Fusion**: Combine audio, temperature, movement, positioning data
4. **Triage Decision**: Risk scoring with explainable reasoning

---

## Hardware Setup

### Pin Mapping (STM32U585 MCU Side)
| Component | Pin | Purpose | Voltage |
|-----------|-----|---------|---------|
| Modulino Knob | A0 | Mode selection | 3.3V |
| Audio Input | A1 | Contact microphone | 3.3V |
| Distance Sensor | D2/D3 | Placement validation | 5V |
| Movement Sensor | D4 | Motion detection | 3.3V |
| Buzzer | D5 | Audio alerts | 3.3V |
| Relay | D6 | External trigger | 3.3V |
| Status LED | D7 | System status | 3.3V |
| Servo 1 (Progress) | D9 | Progress indicator | 5V |
| Servo 2 (Result) | D10 | Result display | 5V |
| Thermo Sensor | SDA/SCL | Temperature reading | 3.3V |

### Connection Diagrams

#### Hardware Assembly Process
![Arduino Triage Setup Step 1](Images/Arduino%20-%20Triage3.png)
*Initial component layout and preparation*

![Arduino Triage Setup Step 2](Images/Arduino%20-%20Triage4.png)
*Modulino sensors and wiring connections*

![Arduino Triage Setup Step 3](Images/Arduino%20-%20Triage5.png)
*Complete hardware assembly with all components connected*

**Detailed wiring guide**: See `HARDWARE_CONNECTIONS.md` for step-by-step assembly instructions

---

## Technical Specifications

- **Processing**: Quad-core ARM Cortex-A53 @ 2.0GHz + ARM Cortex-M33 @ 160MHz
- **Memory**: 2GB LPDDR4 RAM, 8GB eMMC storage
- **Audio**: 8kHz sampling, 20-400Hz (heart), 100-2000Hz (lung) filtering
- **Models**: <2MB TFLite quantized CNNs, <200ms inference time
- **Accuracy Target**: >85% heart sounds, >96% lung sounds
- **Power**: USB-C powered, <10W consumption
- **Connectivity**: USB-A (camera), Serial (MCU communication)

---

## Quick Start Guide

### 1. Hardware Assembly
```bash
# Follow the detailed hardware setup guide
cat HARDWARE_CONNECTIONS.md

# Check pin mapping reference
cat hardware/pinmap.md
```

### 2. Software Installation
```bash
# Connect to Arduino UNO Q via SSH
ssh root@192.168.7.2

# Run automated installation
sudo bash setup/install.sh

# Verify installation
systemctl status triage-station
```

### 3. Model Deployment
```bash
# Deploy pre-trained models (or train your own)
scp models/*.tflite root@192.168.7.2:/opt/triage-station/models/

# Restart system to load models
ssh root@192.168.7.2 "systemctl restart triage-station"
```

### 4. System Testing
```bash
# Run comprehensive system test
cd /opt/triage-station
python3 tests/system_test.py

# Test individual components
python3 tests/test_audio.py
python3 tests/test_ml.py
python3 tests/test_serial.py
```

### 5. Access Web Interface
```
http://192.168.7.2:5000          # Main dashboard
http://192.168.7.2:5000/api/status    # System status API
```
---

## Project Structure

```
Arduino-Triage/
├── README.md                    # This file
├── LICENSE.txt                  # MPL-2.0 License
├── requirements.txt             # Python dependencies
├── main.py                      # Main entry point
├── .gitignore                   # Git ignore rules
│
├── docs/                        # Detailed documentation (9 guides)
│   ├── ARDUINO_UNO_Q_HARDWARE_GUIDE.md
│   ├── COMPLETE_DEPLOYMENT_GUIDE.md
│   ├── COMPLETE_SOFTWARE_GUIDE.md
│   ├── ML_TRAINING_GUIDE.md
│   ├── PHASE_1_HARDWARE.md
│   ├── PHASE_2_AUDIO.md
│   ├── PROJECT_WORKFLOW.md
│   ├── SOFTWARE_ARCHITECTURE_GUIDE.md
│   └── SOFTWARE_IMPLEMENTATION_GUIDE.md
│
├── Hardware-Connections/        # Hardware wiring guides
│
├── Final_deployment/            # Production-ready deployment
│   ├── Firmware/               # Arduino MCU code
│   │   └── main.ino            # Main MCU firmware
│   ├── app.py                  # Flask web application
│   ├── requirements.txt        # Deployment dependencies
│   └── templates/              # Web UI templates
│
├── Final_app/                   # Final integrated application
│
├── linux/                       # Python services & AI
│   ├── core/                   # System management
│   ├── hardware/               # Hardware interfaces
│   ├── audio/                  # Audio processing
│   ├── ml/                     # Machine learning
│   ├── triage/                 # Decision logic
│   ├── calibration/            # Device calibration
│   └── web/                    # Web interface
│
├── models/                      # AI models
│   ├── heart/                  # Heart sound models
│   ├── lung/                   # Lung sound models
│   ├── yamnet/                 # Audio classification
│   └── README.md               # Model documentation
│
├── config/                      # Configuration files
│   ├── system.yaml             # Main system config
│   └── audio.yaml              # Audio settings
│
├── scripts/                     # Utility scripts
│
├── setup/                       # Installation scripts
│   └── install.sh              # Automated setup
│
└── logs/                        # System logs
```

---

## Machine Learning Models

### Heart Sound Classification
- **Input**: 64x128 mel-spectrogram
- **Architecture**: CNN (3 conv blocks + dense layers)
- **Output**: [Normal, Murmur, Extrasystole]
- **Accuracy**: >85% target
- **Size**: <2MB quantized

### Lung Sound Classification  
- **Input**: 64x128 mel-spectrogram
- **Architecture**: CNN (3 conv blocks + dense layers)
- **Output**: [Normal, Wheeze, Crackle, Both]
- **Accuracy**: >96% target
- **Size**: <2MB quantized

**Complete ML pipeline**: See `docs/ML_TRAINING_GUIDE.md` for training instructions

---

## Clinical Impact

- **Early Detection**: Identifies abnormalities missed by basic stethoscopes
- **Standardization**: Consistent screening across different skill levels
- **Referral Optimization**: Reduces unnecessary referrals, catches critical cases
- **Training Support**: Helps build local healthcare capacity
- **Data Sovereignty**: Keeps patient data in local control

---

## Privacy & Security

- **No Audio Storage**: Sounds processed in real-time, never saved
- **Offline Operation**: No internet required, no cloud dependencies
- **Local Processing**: All AI inference happens on-device
- **Anonymized Logs**: Only timestamps and results (no patient data)
- **Secure Updates**: Model updates via USB, not network

---

## Performance Metrics

- **Sensitivity**: >90% for critical abnormalities
- **Specificity**: >85% to minimize false positives
- **Latency**: <200ms inference time
- **Uptime**: >99% system reliability
- **Power Efficiency**: <10W average consumption

---

## Development Roadmap

### Phase 1: Hardware Foundation (Complete)
- Component integration and testing
- MCU-Linux communication
- Basic I/O validation

### Phase 2: Audio Pipeline (Complete)
- Signal processing implementation
- Feature extraction pipeline
- Device calibration system

### Phase 3: ML Training (Complete)
- Dataset preparation and augmentation
- Model training and validation
- TensorFlow Lite conversion

### Phase 4: System Integration (Complete)
- On-device inference deployment
- Sensor fusion logic
- Triage decision system

### Phase 5: User Interface (Complete)
- Web dashboard development
- Real-time visualization
- Demo preparation

### Phase 6: Deployment & Scale
- Pilot clinic deployments
- Performance optimization
- Global expansion planning

---

## Development & Troubleshooting

### System in Action
![Arduino Triage Final Testing](Images/Arduino%20-%20Triage9.jpeg)
*Complete system testing with all sensors active*

![Arduino Triage Calibration Process](Images/Arduino%20-%20Triage10.jpeg)
*Device calibration and sensor validation*

![Arduino Triage Web Interface Demo](Images/Arduino%20-%20Triage11.jpeg)
*Web dashboard showing real-time analysis*

![Arduino Triage Clinical Workflow](Images/Arduino%20-%20Triage12.jpeg)
*Demonstration of clinical examination workflow*

![Arduino Triage Results Display](Images/Arduino%20-%20Triage13.jpeg)
*Final results display with triage recommendations*

### Common Commands
```bash
# System control
sudo systemctl start/stop/restart triage-station
sudo systemctl status triage-station

# View logs
sudo journalctl -u triage-station -f
tail -f /opt/triage-station/logs/system.log

# Run tests
cd /opt/triage-station
python3 tests/system_test.py

# Calibration
python3 -c "from linux.calibration.calibration_manager import CalibrationManager; import asyncio; asyncio.run(CalibrationManager().perform_full_calibration())"
```

### Network Access
```bash
# SSH to device
ssh root@192.168.7.2

# Alternative IPs (if default doesn't work)
ssh root@192.168.42.1
ssh root@10.42.0.1
```

**Complete troubleshooting guide**: See documentation in `docs/` directory

---

## Competition Advantages

### Technical Excellence
- **Professional Architecture**: Production-ready code with comprehensive documentation
- **Real-time Performance**: <200ms end-to-end processing
- **Scalable Design**: Modular architecture supports expansion
- **Edge AI Optimization**: Efficient TensorFlow Lite deployment

### Practical Impact
- **Solves Real Problems**: Addresses actual rural healthcare challenges
- **Deployable Solution**: Works in resource-constrained settings
- **User-Friendly Design**: Intuitive interface for healthcare workers
- **Measurable Outcomes**: Clear clinical benefits and cost savings

### Innovation
- **Multi-Modal Fusion**: Novel approach combining multiple sensor types
- **Device Calibration**: Solves hardware variability challenges
- **Explainable AI**: Real-time reasoning for clinical trust
- **Privacy-First**: No data collection or cloud dependency

---

## Contributing

We welcome contributions! Here's how you can help:

1. **Hardware Testing**: Test on different Arduino UNO Q setups
2. **Model Training**: Improve AI models with new datasets
3. **Documentation**: Enhance guides and tutorials
4. **Bug Reports**: Report issues and suggest improvements
5. **Feature Requests**: Propose new capabilities

### Development Setup
```bash
# Clone repository
git clone https://github.com/Raja-89/Arduino-Triage.git
cd Arduino-Triage

# Install Python dependencies
pip install -r requirements.txt

# Follow setup instructions for device deployment
bash setup/install.sh
```

---

## License

This project is licensed under the **Mozilla Public License 2.0 (MPL-2.0)** - see the [LICENSE.txt](LICENSE.txt) file for details.

### Third-Party Licenses
- TensorFlow Lite: Apache 2.0
- Arduino Libraries: Various (see individual libraries)
- Python Dependencies: Various (see requirements.txt)

---

## Support & Contact

### Documentation
- **Complete Guides**: See `docs/` directory
- **Hardware Setup**: `HARDWARE_CONNECTIONS.md`
- **API Documentation**: `docs/SOFTWARE_ARCHITECTURE_GUIDE.md`
- **Troubleshooting**: `docs/COMPLETE_DEPLOYMENT_GUIDE.md`

### Team
- **Hardware Lead**: Component integration, wiring, mechanical assembly
- **ML Lead**: Model training, TinyML deployment, performance optimization  
- **Software Lead**: Linux services, web UI, system integration
- **Demo Lead**: User experience, presentation, clinical workflow

### Links
- **GitHub Repository**: [https://github.com/Raja-89/Arduino-Triage](https://github.com/Raja-89/Arduino-Triage)

---

## Acknowledgments

- **Arduino x Qualcomm** for the AI for All Hackathon platform
- **PhysioNet** and **ICBHI** for open medical datasets
- **TensorFlow Lite** team for edge AI framework
- **Open source community** for libraries and tools
- **Rural healthcare workers** who inspired this solution

---

## Quick Links

| Resource | Description | Link |
|----------|-------------|------|
| Hardware Setup | Complete assembly guide | [HARDWARE_CONNECTIONS.md](HARDWARE_CONNECTIONS.md) |
| Documentation | Comprehensive guides | [docs/](docs/) |
| ML Training | Model training pipeline | [docs/ML_TRAINING_GUIDE.md](docs/ML_TRAINING_GUIDE.md) |
| Installation | Automated setup | [setup/install.sh](setup/install.sh) |
| Pin Mapping | Hardware connections | [hardware/pinmap.md](hardware/pinmap.md) |



