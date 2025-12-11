# 🏆 Umamusume Tournament Manager

A web application built to manage community Umamusume tournaments. This tool handles team creation, race result tracking, automatic scoring, and generating Discord-ready result exports.

## ✨ Features
* **Team Management:** Create teams, assign captains, and track members.
* **Live Scoring:** Automatic point calculation based on race placements.
* **Data Security:** Admin-only write access via Firebase Security Rules.
* **Discord Integration:** One-click export of results formatted for Discord markdown.
* **Real-time Updates:** Built on Firestore for live data syncing.

## 🛠️ Tech Stack
* **Frontend:** Vue 3, TypeScript, Tailwind CSS
* **Backend/DB:** Firebase (Firestore, Authentication, Hosting)
* **Tooling:** Vite, Firebase Emulators

## 🚀 Getting Started

Follow these steps to run the project locally.

### Prerequisites
* Node.js (v18 or higher recommended)
* Firebase CLI (`npm install -g firebase-tools`)
* Java (required for Firebase Emulators)

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git)
    cd YOUR_REPO_NAME
    ```

2.  **Install dependencies**
    ```bash
    # Go to the frontend directory if applicable
    npm install
    ```

3.  **Setup Environment Variables**
    Create a `.env` file in the root directory. You can contact the repository owner for the development keys, or use your own Firebase project.

    ```properties
    VITE_FIREBASE_API_KEY=your-api-key
    VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
    VITE_FIREBASE_DATABASE_URL=your-database-url.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your-project-id
    VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket.firebasestorage.app
    VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
    VITE_FIREBASE_APP_ID=your-app-id
    VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
    # ... add other firebase config keys
    ```

### Running Locally

We use Firebase Emulators to avoid writing to the production database during development.

1.  **Start the Backend (Emulators)**
    ```bash
    firebase emulators:start
    ```
    *This starts Firestore on port 8080 and the Auth service on port 9099.*

2.  **Start the Frontend**
    Open a new terminal and run:
    ```bash
    npm run dev
    ```

3.  **Open the App**
    Visit `http://localhost:5173` (or the port shown in your terminal).

## 🤝 How to Contribute

Contributions are welcome! Here is the workflow we use:

1.  **Fork** the repository on GitHub.
2.  **Clone** your fork locally.
3.  Create a new **Branch** for your feature (`git checkout -b feature/AmazingFeature`).
4.  **Commit** your changes (`git commit -m 'Add some AmazingFeature'`).
5.  **Push** to your branch (`git push origin feature/AmazingFeature`).
6.  Open a **Pull Request** against the `main` branch.



## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.