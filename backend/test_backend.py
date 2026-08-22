"""
LifeConnect — Backend Automated Integration & Unit Test Suite
Executes comprehensive end-to-end integration tests with automated server thread management.
"""

import sys
import os
import json
import time
import socket
import urllib.request
import urllib.error
import threading
import unittest
from pathlib import Path

# Ensure backend directory is in python path
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from main import app
import uvicorn

BASE_URL = "http://127.0.0.1:8000"


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def ensure_server_running():
    """Ensure local server is running, starting a daemon thread if needed."""
    if not is_port_in_use(8000):
        def start_app():
            uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

        server_thread = threading.Thread(target=start_app, daemon=True)
        server_thread.start()
        
        # Wait up to 5 seconds for server to be ready
        for _ in range(50):
            if is_port_in_use(8000):
                time.sleep(0.2)
                break
            time.sleep(0.1)


ensure_server_running()


def http_req(path: str, method: str = "GET", data: dict = None, headers: dict = None) -> tuple:
    """Helper to send HTTP requests to the test server and return (status_code, response_json)."""
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None

    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.status
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body) if res_body else {}
            return status_code, res_json
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
        except Exception:
            err_json = {"detail": err_body}
        return e.code, err_json


class TestLifeConnectBackend(unittest.TestCase):

    def test_01_health_check(self):
        """Verify health check and database latency diagnostics."""
        status_code, data = http_req("/api/health")
        self.assertEqual(status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertIn("database", data)
        self.assertEqual(data["database"]["status"], "healthy")
        self.assertGreaterEqual(data["uptime_seconds"], 0)
        print("[PASS] Health check & database diagnostics passed")

    def test_02_auth_lifecycle(self):
        """Verify user signup, duplicate prevention, JWT token issuance, and login."""
        unique_email = f"testuser_{int(time.time() * 1000)}@lifeconnect.test"
        
        # 1. Signup
        signup_payload = {
            "full_name": "Ramesh Chandra",
            "email": unique_email,
            "password": "SecurePassword123!",
            "mobile": "+91 9876543210",
            "age": 62,
            "city": "Lucknow",
            "interests": ["Gardening", "Music"],
            "decade": "1970s",
            "bio": "Retired teacher loving classical music."
        }
        status_code, signup_res = http_req("/api/auth/signup", method="POST", data=signup_payload)
        self.assertEqual(status_code, 201)
        self.assertTrue(signup_res["success"])
        self.assertIn("user", signup_res)
        self.assertIn("token", signup_res)
        self.assertEqual(signup_res["user"]["email"], unique_email)

        # 2. Duplicate Signup Prevention
        dup_status, dup_res = http_req("/api/auth/signup", method="POST", data=signup_payload)
        self.assertEqual(dup_status, 409)

        # 3. Login
        login_payload = {"email": unique_email, "password": "SecurePassword123!"}
        login_status, login_res = http_req("/api/auth/login", method="POST", data=login_payload)
        self.assertEqual(login_status, 200)
        self.assertTrue(login_res["success"])
        self.assertIn("token", login_res)

        # 4. Verify /auth/me with Bearer token
        token = login_res["token"]
        me_status, me_res = http_req("/api/auth/me", method="GET", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_status, 200)
        self.assertEqual(me_res["user"]["email"], unique_email)

        # 5. Invalid Password Login
        bad_status, _ = http_req("/api/auth/login", method="POST", data={"email": unique_email, "password": "WrongPassword"})
        self.assertEqual(bad_status, 401)

        print("[PASS] Auth lifecycle (Signup, JWT tokens, Login, /auth/me, Dup check) passed")

    def test_03_profile_and_user_discovery(self):
        """Verify profile retrieval, updates, and user search with filters."""
        # Fetch demo user
        s, demo_login = http_req("/api/auth/login", method="POST", data={"email": "demo@lifeconnect.local", "password": "Demo123!"})
        self.assertEqual(s, 200)
        user_id = demo_login["user"]["id"]

        # Profile fetch
        p_status, profile = http_req(f"/api/profile/{user_id}")
        self.assertEqual(p_status, 200)
        self.assertEqual(profile["id"], user_id)

        # Profile update
        up_status, updated = http_req(
            f"/api/profile/{user_id}",
            method="PUT",
            data={"city": "Varanasi", "bio": "Avid reader and classical music enthusiast."}
        )
        self.assertEqual(up_status, 200)
        self.assertEqual(updated["user"]["city"], "Varanasi")

        # User discovery search
        search_status, search_res = http_req("/api/users?city=Varanasi")
        self.assertEqual(search_status, 200)
        self.assertGreaterEqual(search_res["total"], 1)

        print("[PASS] Profile management & user discovery passed")

    def test_04_memories_crud(self):
        """Verify memory creation, retrieval with pagination & search, updating, and deletion."""
        # 1. Login demo user
        _, demo_login = http_req("/api/auth/login", method="POST", data={"email": "demo@lifeconnect.local", "password": "Demo123!"})
        user_id = demo_login["user"]["id"]

        # 2. Create memory
        mem_payload = {
            "user_id": user_id,
            "year": 1974,
            "title": "College Graduation Day",
            "content": "Graduated with honors in B.Sc Mathematics from Lucknow University.",
            "media_type": "story",
            "emoji": "🎓"
        }
        create_status, create_res = http_req("/api/memories", method="POST", data=mem_payload)
        self.assertEqual(create_status, 201)
        self.assertTrue(create_res["success"])
        memory_id = create_res["memory"]["id"]

        # 3. Retrieve memories with pagination
        get_status, get_res = http_req(f"/api/memories/{user_id}?limit=10&offset=0")
        self.assertEqual(get_status, 200)
        self.assertGreaterEqual(get_res["total"], 1)

        # 4. Search memories
        search_status, search_res = http_req(f"/api/memories/{user_id}?search=Graduation")
        self.assertEqual(search_status, 200)
        self.assertGreaterEqual(search_res["total"], 1)

        # 5. Update memory
        up_status, up_res = http_req(f"/api/memories/{memory_id}", method="PUT", data={"title": "College Graduation Day 1974 (Honors)"})
        self.assertEqual(up_status, 200)
        self.assertEqual(up_res["memory"]["title"], "College Graduation Day 1974 (Honors)")

        # 6. Delete memory
        del_status, _ = http_req(f"/api/memories/{memory_id}", method="DELETE")
        self.assertEqual(del_status, 200)

        print("[PASS] Memory Vault CRUD & Pagination passed")

    def test_05_connections(self):
        """Verify friend request sending, accepting, and listing."""
        # Create user A and user B
        u1_email = f"usera_{int(time.time() * 1000)}@test.com"
        u2_email = f"userb_{int(time.time() * 1000)}@test.com"
        _, res_a = http_req("/api/auth/signup", method="POST", data={"full_name": "User A", "email": u1_email, "password": "Password123!"})
        _, res_b = http_req("/api/auth/signup", method="POST", data={"full_name": "User B", "email": u2_email, "password": "Password123!"})
        user_a_id = res_a["user"]["id"]
        user_b_id = res_b["user"]["id"]

        # Send connection request from A to B
        req_status, req_res = http_req("/api/connections", method="POST", data={"user_id": user_a_id, "friend_id": user_b_id})
        self.assertEqual(req_status, 201)
        conn_id = req_res["id"]

        # Accept connection
        acc_status, _ = http_req(f"/api/connections/{conn_id}/accept", method="PUT")
        self.assertEqual(acc_status, 200)

        # List connections
        list_status, list_res = http_req(f"/api/connections/{user_a_id}")
        self.assertEqual(list_status, 200)
        self.assertEqual(list_res["total"], 1)

        print("[PASS] Connections & friend requests passed")

    def test_06_communities(self):
        """Verify communities listing, filtering, joining, and leaving."""
        # List communities
        s, comms = http_req("/api/communities")
        self.assertEqual(s, 200)
        self.assertGreaterEqual(comms["total"], 1)
        target_comm_id = comms["communities"][0]["id"]

        # Demo user join community
        _, demo_login = http_req("/api/auth/login", method="POST", data={"email": "demo@lifeconnect.local", "password": "Demo123!"})
        user_id = demo_login["user"]["id"]

        join_s, _ = http_req("/api/communities/join", method="POST", data={"user_id": user_id, "community_id": target_comm_id})
        self.assertIn(join_s, [200, 409])  # 200 if new, 409 if already joined

        # Get my communities
        my_s, my_comms = http_req(f"/api/communities/{user_id}/mine")
        self.assertEqual(my_s, 200)
        self.assertGreaterEqual(my_comms["total"], 1)

        print("[PASS] Communities directory & memberships passed")

    def test_07_wellness_tracking(self):
        """Verify logging wellness activity, marking completion, summary stats, and dashboard summary."""
        _, demo_login = http_req("/api/auth/login", method="POST", data={"email": "demo@lifeconnect.local", "password": "Demo123!"})
        user_id = demo_login["user"]["id"]

        # Log wellness activity
        w_status, w_data = http_req("/api/wellness", method="POST", data={"user_id": user_id, "activity": "Morning Pranayama", "completed": 0})
        self.assertEqual(w_status, 201)
        activity_id = w_data["id"]

        # Mark complete
        comp_status, _ = http_req(f"/api/wellness/{activity_id}/complete", method="PUT")
        self.assertEqual(comp_status, 200)

        # Wellness summary
        sum_status, summary = http_req(f"/api/wellness/{user_id}/summary")
        self.assertEqual(sum_status, 200)
        self.assertGreaterEqual(summary["today_completed"], 1)

        # Dashboard consolidated snapshot
        dash_status, dash_data = http_req(f"/api/dashboard/{user_id}/summary")
        self.assertEqual(dash_status, 200)
        self.assertIn("stats", dash_data)
        
        print("[PASS] Wellness tracking and Consolidated Dashboard Summary passed")

    def test_08_companion_chatbot(self):
        """Verify Companion Chatbot responds for app purposes, memories, and companionship."""
        s1, chat1 = http_req("/api/chat", method="POST", data={"messages": [{"role": "user", "content": "How can I store my old photos and memories?"}]})
        self.assertEqual(s1, 200)
        self.assertIn("memory", chat1["text"].lower())

        s2, chat2 = http_req("/api/chat", method="POST", data={"messages": [{"role": "user", "content": "Can you help me find my school friends?"}]})
        self.assertEqual(s2, 200)
        self.assertIn("reconnect", chat2["text"].lower())

        print("[PASS] Companion Chatbot (App purposes, Memory Vault, Reconnect) passed")

    def test_09_audio_status(self):
        """Verify audio engine status diagnostics."""
        s, data = http_req("/api/audio/status")
        self.assertEqual(s, 200)
        self.assertIn("pipeline", data)
        print("[PASS] Audio processing status diagnostics passed")

    def test_10_voice_search_engine(self):
        """Verify Google-style Voice Search Engine responds with direct facts and commodity prices."""
        # 1. Milk search
        s1, res1 = http_req("/api/voice/search", method="POST", data={"query": "What is the price of milk and paneer today?"})
        self.assertEqual(s1, 200)
        self.assertTrue(res1["success"])
        self.assertIn("milk", res1["answer"].lower())

        # 2. Blood pressure search
        s2, res2 = http_req("/api/voice/search", method="POST", data={"query": "What is the normal blood pressure for senior citizens?"})
        self.assertEqual(s2, 200)
        self.assertIn("blood pressure", res2["answer"].lower())

        # 3. Cricket knowledge search
        s3, res3 = http_req("/api/voice/search", method="POST", data={"query": "Who won the 1983 Cricket World Cup?"})
        self.assertEqual(s3, 200)
        self.assertIn("1983", res3["answer"].lower())

        print("[PASS] Google-style Voice Search Engine (Prices, Health facts, Knowledge) passed")

    def test_11_voice_assistant_greetings(self):
        """Verify Voice Assistant responds with warm and culturally appropriate answers to greetings."""
        greetings = [
            ("Hello", "welcome"),
            ("Good morning", "morning"),
            ("Pranam", "pranam"),
            ("Namaste", "namaste"),
            ("Asalam walekum", "walekum assalam"),
            ("Kem cho", "kem cho"),
            ("Sat sri akal", "sat sri akal"),
        ]
        for query, expected in greetings:
            s, res = http_req("/api/voice/search", method="POST", data={"query": query})
            self.assertEqual(s, 200)
            self.assertIn(expected.lower(), res["answer"].lower(), f"Failed on greeting: {query}")

        print("[PASS] Voice Assistant Greetings (Hello, Good Morning, Pranam, Namaste, Asalam Walekum, Kem Cho, Sat Sri Akal) passed")

    def test_12_gayatri_mantra(self):
        """Verify Voice Assistant accurately recites and explains the sacred Gayatri Mantra."""
        s, res = http_req("/api/voice/search", method="POST", data={"query": "Recite the Gayatri Mantra and its meaning"})
        self.assertEqual(s, 200)
        self.assertTrue(res["success"])
        self.assertIn("prachodayat", res["answer"].lower())
        self.assertIn("intellect", res["answer"].lower())
        print("[PASS] Sacred Gayatri Mantra Recitation & Meaning passed")

    def test_13_news_endpoint(self):
        """Verify 24-hour National India and 12 Cities News endpoint."""
        s, res = http_req("/api/news")
        self.assertEqual(s, 200)
        self.assertTrue(res["success"])
        self.assertEqual(res["cities_count"], 12)
        self.assertIn("national_24h", res["data"])
        self.assertIn("cities", res["data"])
        self.assertIn("New Delhi", res["data"]["cities"])
        self.assertIn("Mumbai", res["data"]["cities"])
        print("[PASS] 24-Hour India & 12 Cities News Bulletin passed")


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING LIFECONNECT BACKEND INTEGRATION TEST SUITE")
    print("=======================================================\n")
    unittest.main(verbosity=2)
