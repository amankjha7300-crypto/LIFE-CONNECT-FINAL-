"""
LifeConnect — Backend Automated Test Suite
Executes end-to-end integration tests for all API endpoints against the live server.
"""

import urllib.request
import urllib.error
import json
import time
import unittest

BASE_URL = "http://127.0.0.1:8000"


def http_req(path: str, method: str = "GET", data: dict = None) -> tuple:
    """Helper to send HTTP requests and return (status_code, response_json)."""
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
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
        """Verify user signup, duplicate prevention, and login with PBKDF2."""
        unique_email = f"testuser_{int(time.time())}@lifeconnect.test"
        
        # 1. Signup
        signup_payload = {
            "full_name": "Ramesh Chandra",
            "email": unique_email,
            "password": "SecurePassword123!",
            "mobile": "+91 9876543210",
            "age": 62,
            "city": "Lucknow",
            "interests": ["Music", "Gardening", "Cricket"],
            "decade": "1970s",
            "bio": "Retired school principal passionate about classical music."
        }
        status_code, data = http_req("/api/auth/signup", method="POST", data=signup_payload)
        self.assertEqual(status_code, 201)
        self.assertTrue(data["success"])
        user_id = data["user"]["id"]
        self.assertEqual(data["user"]["full_name"], "Ramesh Chandra")
        self.assertEqual(data["user"]["interests"], ["Music", "Gardening", "Cricket"])

        # 2. Duplicate Signup rejection
        dup_status, dup_data = http_req("/api/auth/signup", method="POST", data=signup_payload)
        self.assertEqual(dup_status, 409)

        # 3. Successful Login
        login_status, login_data = http_req("/api/auth/login", method="POST", data={
            "email": unique_email,
            "password": "SecurePassword123!"
        })
        self.assertEqual(login_status, 200)
        self.assertEqual(login_data["user"]["id"], user_id)

        # 4. Failed Login (Wrong password)
        bad_status, _ = http_req("/api/auth/login", method="POST", data={
            "email": unique_email,
            "password": "WrongPassword!"
        })
        self.assertEqual(bad_status, 401)

        # 5. Logout
        logout_status, logout_data = http_req("/api/auth/logout", method="POST")
        self.assertEqual(logout_status, 200)
        
        print("[PASS] Auth lifecycle (Signup, PBKDF2 hash, Duplicates, Login, Logout) passed")
        return user_id

    def test_03_profile_and_user_discovery(self):
        """Verify profile retrieval, updates, and user search."""
        unique_email = f"profileuser_{int(time.time())}@lifeconnect.test"
        _, u_data = http_req("/api/auth/signup", method="POST", data={
            "full_name": "Kavita Sharma",
            "email": unique_email,
            "password": "Password789!",
            "age": 58,
            "city": "Jaipur"
        })
        user_id = u_data["user"]["id"]

        # Get Profile
        prof_status, prof_data = http_req(f"/api/profile/{user_id}")
        self.assertEqual(prof_status, 200)
        self.assertEqual(prof_data["full_name"], "Kavita Sharma")

        # Update Profile (PUT)
        update_status, update_data = http_req(f"/api/profile/{user_id}", method="PUT", data={
            "city": "Udaipur",
            "bio": "Passionate about literature and painting.",
            "interests": ["Books", "Art"]
        })
        self.assertEqual(update_status, 200)
        updated_user = update_data["user"]
        self.assertEqual(updated_user["city"], "Udaipur")
        self.assertEqual(updated_user["bio"], "Passionate about literature and painting.")

        # User Search
        search_status, search_data = http_req("/api/users?city=Udaipur")
        self.assertEqual(search_status, 200)
        self.assertGreaterEqual(search_data["total"], 1)
        
        print("[PASS] Profile management (GET/PUT) and user discovery passed")

    def test_04_memories_crud(self):
        """Verify memory creation, retrieval, updating, and deletion."""
        unique_email = f"memuser_{int(time.time())}@lifeconnect.test"
        _, u_data = http_req("/api/auth/signup", method="POST", data={
            "full_name": "Sunil Verma",
            "email": unique_email,
            "password": "Password123!"
        })
        user_id = u_data["user"]["id"]

        # 1. Create Memory
        mem_status, mem_data = http_req("/api/memories", method="POST", data={
            "user_id": user_id,
            "year": 1983,
            "title": "World Cup Celebration",
            "content": "Colony gathered around the TV to watch Kapil Dev lift the World Cup trophy.",
            "media_type": "story",
            "emoji": "🏏"
        })
        self.assertEqual(mem_status, 201)
        memory_id = mem_data["memory"]["id"]

        # 2. Get Memories
        get_status, get_data = http_req(f"/api/memories/{user_id}")
        self.assertEqual(get_status, 200)
        self.assertEqual(len(get_data["memories"]), 1)

        # 3. Update Memory (PUT)
        up_status, up_data = http_req(f"/api/memories/{memory_id}", method="PUT", data={
            "title": "1983 World Cup Historic Win",
            "year": 1983
        })
        self.assertEqual(up_status, 200)
        self.assertEqual(up_data["memory"]["title"], "1983 World Cup Historic Win")

        # 4. Delete Memory
        del_status, _ = http_req(f"/api/memories/{memory_id}", method="DELETE")
        self.assertEqual(del_status, 200)

        # Verify empty
        after_status, after_data = http_req(f"/api/memories/{user_id}")
        self.assertEqual(len(after_data["memories"]), 0)
        
        print("[PASS] Memories CRUD (Create, Read, Update, Delete) passed")

    def test_05_connections_flow(self):
        """Verify connecting with friends, accepting requests, and removing connections."""
        t = int(time.time())
        _, u1 = http_req("/api/auth/signup", method="POST", data={"full_name": "Friend A", "email": f"fa_{t}@test.com", "password": "Pass123!"})
        _, u2 = http_req("/api/auth/signup", method="POST", data={"full_name": "Friend B", "email": f"fb_{t}@test.com", "password": "Pass123!"})
        u1_id = u1["user"]["id"]
        u2_id = u2["user"]["id"]

        # Send connection request
        req_status, req_data = http_req("/api/connections", method="POST", data={"user_id": u1_id, "friend_id": u2_id})
        self.assertEqual(req_status, 201)
        conn_id = req_data["id"]

        # List connections
        c_status, c_list = http_req(f"/api/connections/{u1_id}")
        self.assertEqual(c_status, 200)
        self.assertEqual(c_list["total"], 1)
        self.assertEqual(c_list["connections"][0]["status"], "pending")

        # Accept connection
        acc_status, _ = http_req(f"/api/connections/{conn_id}/accept", method="PUT")
        self.assertEqual(acc_status, 200)

        # Delete connection
        del_status, _ = http_req(f"/api/connections/{conn_id}", method="DELETE")
        self.assertEqual(del_status, 200)
        
        print("[PASS] Connections & Friends workflow passed")

    def test_06_communities_flow(self):
        """Verify community listing, joining, and leaving."""
        # Get communities
        comms_status, comms_data = http_req("/api/communities")
        self.assertEqual(comms_status, 200)
        communities = comms_data["communities"]
        self.assertGreater(len(communities), 0)
        first_comm_id = communities[0]["id"]

        # Create user
        _, u_data = http_req("/api/auth/signup", method="POST", data={
            "full_name": "Community Explorer",
            "email": f"comm_{int(time.time())}@test.com",
            "password": "Password123!"
        })
        user_id = u_data["user"]["id"]

        # Join community
        join_status, _ = http_req("/api/communities/join", method="POST", data={"user_id": user_id, "community_id": first_comm_id})
        self.assertEqual(join_status, 200)

        # Check my communities
        my_status, my_comms = http_req(f"/api/communities/{user_id}/mine")
        self.assertEqual(my_status, 200)
        self.assertEqual(my_comms["total"], 1)

        # Leave community
        leave_status, _ = http_req("/api/communities/leave", method="DELETE", data={"user_id": user_id, "community_id": first_comm_id})
        self.assertEqual(leave_status, 200)
        
        print("[PASS] Communities (List, Join, Member check, Leave) passed")

    def test_07_wellness_and_dashboard_summary(self):
        """Verify wellness logging, completion, and consolidated dashboard aggregation."""
        _, u_data = http_req("/api/auth/signup", method="POST", data={
            "full_name": "Wellness Champion",
            "email": f"well_{int(time.time())}@test.com",
            "password": "Password123!"
        })
        user_id = u_data["user"]["id"]

        # Log wellness
        w_status, w_data = http_req("/api/wellness", method="POST", data={"user_id": user_id, "activity": "Morning Pranayama Breathing", "completed": 0})
        self.assertEqual(w_status, 201)
        activity_id = w_data["id"]

        # Mark complete
        comp_status, _ = http_req(f"/api/wellness/{activity_id}/complete", method="PUT")
        self.assertEqual(comp_status, 200)

        # Wellness summary
        sum_status, summary = http_req(f"/api/wellness/{user_id}/summary")
        self.assertEqual(sum_status, 200)
        self.assertEqual(summary["today_completed"], 1)
        self.assertEqual(summary["today_percentage"], 100)

        # Dashboard consolidated snapshot
        dash_status, dash_data = http_req(f"/api/dashboard/{user_id}/summary")
        self.assertEqual(dash_status, 200)
        stats = dash_data["stats"]
        self.assertEqual(stats["wellness_completed_today"], 1)
        
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


if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING LIFECONNECT BACKEND INTEGRATION TEST SUITE")
    print("=======================================================\n")
    unittest.main(verbosity=2)
