# LifeConnect

"Reconnect with your past. Live meaningfully today."

LifeConnect is an AI-powered life companion designed specifically for people aged 50 and above. It provides a safe, joyful, and deeply personalized space to reconnect with loved ones, relive the past, stay active, and live each day meaningfully.

## Features

- **Nostalgia Library & Memory Vault**: Discover songs, movies, radio shows, and magazines from the golden eras (1960s-1990s). Save your precious personal memories for future generations.
- **AI Companion (Mitra/Saheli/Guru)**: A gentle, patient AI companion that learns your preferences, reminds you of favorite songs, helps you navigate the app via voice, and provides emotional well-being check-ins.
- **Find Old Friends**: Search for and reconnect with classmates, colleagues, and neighbors from your school or college days.
- **Daily Wellness**: Engage in light fitness, memory games, breathing exercises, and meaningful daily habits.
- **Legal & Document Explainer**: A simple AI tool to explain complex pension forms, bank documents, and government schemes in plain language.
- **Family Bridge**: Easily share life stories and recorded memories with family members in a private and secure manner.

## Tech Stack

LifeConnect purposely avoids heavy frontend frameworks in favor of an elegant, lightning-fast architecture.

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (Vanilla)
- **Design System**: Custom CSS Variables, responsive grid layout, warm aesthetics
- **Backend**: Python 3, Flask, SQLite3
- **Icons**: Lucide Icons (via CDN)

## Project Structure

```text
LifeConnect/
│
├── backend/
│   ├── main.py        # Flask application entry point and static server
│   ├── database.py    # SQLite3 database initialization and schema
│   └── routes.py      # REST API endpoints
│
├── frontend/
│   ├── index.html     # Main Single-Page Application HTML
│   ├── style.css      # Design system, layout, and component styles
│   └── script.js      # SPA routing, mock data, AI chat logic, and UI interactions
│
├── requirements.txt   # Python dependencies
└── README.md          # Project documentation
```

## Running the Application Locally

1. **Install dependencies**:
   Ensure you have Python installed, then run:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the backend server**:
   From the root `LifeConnect` directory, run the Flask backend. This will also automatically serve the frontend:
   ```bash
   python backend/main.py
   ```

3. **Open the app**:
   Navigate to `http://localhost:5000` in your web browser.

4. **Demo Account**:
   You can log in to the demo experience using:
   - **Email**: demo@lifeconnect.local
   - **Password**: Demo123!

## Privacy and Safety First

LifeConnect is built with privacy at its core.
- **Private by Default**: Your profile, memory vault, and preferences are private.
- **Permission-Based Sharing**: Family sharing requires explicit consent.
- **AI Transparency**: The companion is always clearly identified as an AI. It never pretends to be a person.
