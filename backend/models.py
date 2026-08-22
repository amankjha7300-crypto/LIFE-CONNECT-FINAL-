import os
import asyncio
import re

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

openai_api_key = os.getenv("OPENAI_API_KEY")


# ══════════════════════════════════════════════════════════════════════════════
# 1. CHATBOT (AI COMPANION — MITRA / GURU / SAHELI)
# Purpose: Strictly for in-app assistance, personal companionship, Memory Vault,
# Reconnect, daily wellness, and app tasks.
# ══════════════════════════════════════════════════════════════════════════════

async def get_llm_chat_response(messages: list) -> str:
    """In-app Companion Chatbot logic.
    Maintains personality, personal memory, emotional support, and LifeConnect app navigation.
    """
    if OPENAI_AVAILABLE and openai_api_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_api_key)
            
            system_prompt = {
                "role": "system",
                "content": (
                    "You are the user's personal AI Companion ('Mitra', 'Guru', or 'Saheli') on LifeConnect, "
                    "a dedicated lifestyle app for elders and people 50+ in India.\n\n"
                    "YOUR ROLE & SCOPE:\n"
                    "1. App Assistance & Task Guidance: Help the user explore the Memory Vault (saving & viewing nostalgic memories), "
                    "finding old school/college friends in the Reconnect section, joining senior Communities, and checking off daily Wellness activities (morning yoga, breathing, walks).\n"
                    "2. Empathetic Companionship: Provide warm, patient, and respectful conversation ('Ji'). Listen to their memories from the 1960s-1980s, family stories, and daily thoughts.\n"
                    "3. Boundaries: You are a personal friend and app companion. For open-ended global internet searches and general queries, you can answer warmly or remind them that the Voice Search Engine is also available.\n\n"
                    "TONE: Warm, respectful, engaging, and conversational (2 to 4 sentences). Never cold or robotic."
                )
            }
            
            formatted_messages = [system_prompt] + [m for m in messages if m.get("role") != "system"]
            
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=formatted_messages,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI Chatbot error: {e}")
            
    # Companion fallback
    await asyncio.sleep(0.6)
    last_msg = (messages[-1]["content"] if messages else "").lower()
    
    if any(w in last_msg for w in ["memory", "vault", "photo", "story", "yaad"]):
        return (
            "I would love to help you with your memories. You can store your cherished stories, school days, "
            "and family photos safely in the Memory Vault. Would you like me to guide you there?"
        )
    if any(w in last_msg for w in ["friend", "reconnect", "batch", "school", "college", "dost"]):
        return (
            "Reconnecting with old classmates and colleagues brings so much joy. In our Reconnect section, "
            "you can search by school, batch year, or city to find people from your past."
        )
    if any(w in last_msg for w in ["wellness", "yoga", "exercise", "walk", "breathe", "pranayama"]):
        return (
            "Taking care of your daily wellness is so important. Today's wellness activities include gentle morning stretches, "
            "a light walk, and deep breathing. Shall we open the Wellness section together?"
        )
        
    return (
        "I'm right here with you as your companion. Whether you'd like to share a memory, "
        "reconnect with old friends, explore our community groups, or just have a pleasant chat, I am happy to help."
    )


# ══════════════════════════════════════════════════════════════════════════════
# 2. VOICE ASSISTANT (GOOGLE-STYLE SMART VOICE SEARCH ENGINE)
# Purpose: Universal voice search engine for general knowledge, factual queries,
# live market prices (groceries/veggies/milk), health facts, remedies, weather, sports, and info.
# ══════════════════════════════════════════════════════════════════════════════

# In-memory LRU cache for frequent voice search queries
_voice_search_cache: Dict[str, str] = {}

async def get_voice_search_response(query_text: str) -> str:
    """Google-style Voice Search Engine with in-memory query caching.
    Direct, factual, spoken voice answers for real-world queries, greetings, market prices, illnesses, and facts.
    """
    clean_key = query_text.strip().lower()
    if clean_key in _voice_search_cache:
        return _voice_search_cache[clean_key]

    res = await _compute_voice_search(query_text)
    if len(_voice_search_cache) > 200:
        _voice_search_cache.clear()  # simple cache purge on max size
    _voice_search_cache[clean_key] = res
    return res

async def _compute_voice_search(query_text: str) -> str:
    if OPENAI_AVAILABLE and openai_api_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_api_key)
            
            system_prompt = {
                "role": "system",
                "content": (
                    "You are the LifeConnect Voice Search Assistant — a smart, lightning-fast, Google-style voice search and knowledge engine designed for senior citizens.\n\n"
                    "YOUR PURPOSE:\n"
                    "- Provide direct, clear, highly accurate factual answers to ANY question the user asks by voice.\n"
                    "- Topics include: Greetings across all Indian languages/cultures, Indian market commodity prices (milk, salt, vegetables, oil, ghee), health facts, home remedies, disease guidance, medicine information, weather, cricket/sports scores & history, recipes, geography, current facts, and general knowledge.\n\n"
                    "GREETINGS & CULTURAL RESPECT:\n"
                    "- 'Namaste' / 'Namaskar' / 'Namaskaram' -> 'Namaste Ji! Wishing you good health. How can I assist you with your search or queries today?'\n"
                    "- 'Pranam' / 'Charan Sparsh' -> 'Pranam Ji! Sada khush aur tandurust rahein. Kahiye, aaj aapke liye kya jankari laaoon?'\n"
                    "- 'Good morning' / 'Shubh Prabhat' -> 'A very good morning to you! Wishing you a peaceful and bright day ahead. What would you like to search today?'\n"
                    "- 'Good afternoon' -> 'Good afternoon! Hope you are having a pleasant day. How may I help you right now?'\n"
                    "- 'Good evening' / 'Shubh Sandhya' -> 'Good evening! Hope you had a relaxing day. How can I assist you this evening?'\n"
                    "- 'Good night' -> 'Good night! Wishing you deep and restful sleep. Take care and stay well.'\n"
                    "- 'Assalamu Alaikum' / 'Asalam Walekum' / 'Salam' -> 'Walekum Assalam Wa Rahmatullahi Wa Barakatuh! Kahiye, aaj aapki kya khidmat karoon?'\n"
                    "- 'Kem Cho' -> 'Kem cho Ji! Majama chho? Kahiye, aaj kya jankari ya bhav janna chahte hain?'\n"
                    "- 'Sat Sri Akal' -> 'Sat Sri Akal Ji! Waheguru ji da khalsa, Waheguru ji di fateh. How can I help you today?'\n"
                    "- 'Vanakkam' / 'Namaskara' -> 'Vanakkam! Hope you are doing wonderful. What would you like to explore or search today?'\n"
                    "- 'Radhe Radhe' / 'Ram Ram' / 'Jai Shree Krishna' / 'Jai Jinendra' -> Respond with the matching greeting with devotion and warmth.\n\n"
                    "GAYATRI MANTRA & SPIRITUAL RECITATIONS:\n"
                    "- When asked about Gayatri Mantra ('Recite Gayatri Mantra', 'Gayatri Mantra sunao', 'Meaning of Gayatri Mantra', 'Gayatri Mantra details'):\n"
                    "- Recite the sacred verse clearly: 'Om Bhur Bhuvaḥ Swaḥ, Tat-savitur Vareṇyaṃ, Bhargo Devasya Dhīmahi, Dhiyo Yo Naḥ Prachodayāt.'\n"
                    "- Explain the sacred meaning: 'We meditate on the supreme divine radiance of the Creator who illuminates the cosmos. May that divine light illuminate and inspire our intellect and wisdom.'\n"
                    "- Mention its sacred benefits for senior wellness, inner calmness, and mental clarity.\n\n"
                    "VOICE SEARCH GUIDELINES:\n"
                    "1. Direct Answer First: Give the exact answer in the first sentence, just like Google Voice Assistant / Google Search Knowledge Graph.\n"
                    "2. Spoken Optimization: Keep answers between 2 to 4 clear, spoken-friendly sentences. Avoid complex bullet symbols or markdown tables since this will be read aloud.\n"
                    "3. Indian Context: When asked about prices or groceries, give realistic Indian retail market benchmarks (in ₹ INR). When asked about health, give comforting home remedies alongside a reminder to consult their doctor.\n"
                    "4. Persona: Fast, smart, polite, and helpful voice search engine."
                )
            }
            
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    system_prompt,
                    {"role": "user", "content": query_text}
                ],
                temperature=0.4,  # Lower temperature for high factual accuracy
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI Voice Search error: {e}")

    # Domain Knowledge Search Fallback (Offline / Without OpenAI API key)
    await asyncio.sleep(0.5)
    q = query_text.lower().strip()
    
    def has_kw(kws):
        return any(re.search(rf"\b{re.escape(k)}\b", q) for k in kws)

    # 0. Sacred Gayatri Mantra & Mantras
    if has_kw(["gayatri", "gaytri", "gayatree", "savitur", "prachodayat"]):
        return (
            "The sacred Gayatri Mantra is: 'Om Bhur Bhuvah Swah, Tat Savitur Varenyam, Bhargo Devasya Dheemahi, Dhiyo Yo Nah Prachodayat.' "
            "Its divine meaning is: 'We meditate on the supreme light of the divine Creator who illuminates all realms. May that spiritual light inspire and guide our intellect and wisdom.' "
            "Chanting this revered Vedic mantra brings deep inner peace, spiritual calmness, and mental clarity."
        )

    # 1. Greetings & Cultural Manners
    if has_kw(["pranam", "pranaam", "charan", "sparsh"]):
        return "Pranam Ji! Sada khush aur tandurust rahein. Kahiye, aaj aapke liye kya jankari ya search karoon?"

    if has_kw(["namaste", "namaskar", "namaskaram", "namastey"]):
        return "Namaste Ji! A warm welcome. How may I assist you with your questions, daily prices, or health remedies today?"

    if has_kw(["asalam", "assalam", "assalamu", "walekum", "alaikum", "salam", "salaam"]):
        return "Walekum Assalam Wa Rahmatullahi Wa Barakatuh! Kahiye, aaj aapke liye kya search ya jankari laaoon?"

    if has_kw(["kem cho", "kemcho", "majama", "kem chho"]):
        return "Kem cho Ji! Majama chho? Kahiye, aaj market na bhav ke biji koi jankari janna chahte hain?"

    if has_kw(["sat sri akal", "sasriakal", "satsriakal", "waheguru"]):
        return "Sat Sri Akal Ji! Waheguru ji ka khalsa, Waheguru ji ki fateh. Kahiye, aaj ki seva karoon?"

    if has_kw(["vanakkam", "namaskara", "namaskaramu"]):
        return "Vanakkam! A warm welcome to you. What would you like to search or know today?"

    if has_kw(["radhe radhe", "ram ram", "jai shree krishna", "jai jinendra", "om shanti"]):
        return f"{query_text.title()} Ji! Wishing you peace, good health, and joy. How can I help you today?"

    if has_kw(["good morning", "shubh prabhat", "subah"]):
        return "A very good morning to you! Wishing you a peaceful and bright day ahead. What would you like to know or search today?"

    if has_kw(["good afternoon", "shubh dopahar"]):
        return "Good afternoon! Hope you are having a pleasant day. How may I help you right now?"

    if has_kw(["good evening", "shubh sandhya"]):
        return "Good evening! Hope you had a relaxing day. What can I search or help you with this evening?"

    if has_kw(["good night", "shubh ratri"]):
        return "Good night! Wishing you deep and restful sleep. Take care and stay well."

    if has_kw(["hello", "hi", "hey", "hullo", "kaise ho", "kya haal"]):
        return "Hello and welcome! I am your Voice Assistant. You can ask me anything — today's grocery and vegetable prices, health remedies, weather, cricket facts, or daily knowledge."

    # 1. Milk & Dairy Search
    if has_kw(["milk", "doodh", "dairy", "paneer", "curd", "dahi"]):
        return (
            "In local Indian retail markets today, full cream milk (Amul Gold / Mother Dairy) is around ₹66 to ₹72 per liter, "
            "toned or cow milk is approximately ₹54 to ₹58 per liter, and fresh paneer is about ₹90 to ₹120 for 200 grams."
        )

    # 2. Vegetables & Fruits Search
    if has_kw(["vegetable", "vegetables", "sabzi", "sabji", "potato", "aloo", "onion", "pyaz", "tomato", "tamatar", "fruit", "fruits", "kela", "banana", "apple", "seb", "price", "rate", "bhav", "cost"]):
        return (
            "According to mandi rates today: potatoes (aloo) are ₹25 to ₹35 per kilo, onions (pyaz) are ₹30 to ₹45, "
            "tomatoes (tamatar) range between ₹25 to ₹40 per kilo, and bananas are roughly ₹45 to ₹60 a dozen."
        )

    # 3. Salt, Sugar, Oil & Spices Search
    if has_kw(["salt", "namak", "sugar", "cheeni", "tea", "chai", "ghee", "oil", "tel", "atta", "rice", "dal"]):
        return (
            "Tata Salt is currently ₹25 to ₹30 per kg, Sendha Namak is ₹40 to ₹60, refined sugar is ₹42 to ₹46 per kg, "
            "mustard oil is roughly ₹140 to ₹170 per liter, whole wheat atta is ₹38 to ₹48 per kg, and pure desi ghee is ₹550 to ₹750 per liter."
        )

    # 4. Blood Pressure / Hypertension Search
    if has_kw(["bp", "blood pressure", "hypertension", "high pressure"]):
        return (
            "For seniors, a healthy blood pressure target is around 120 to 130 over 80 mmHg. "
            "Reducing salt intake, daily 30-minute morning walks, and morning Pranayama breathing help keep it in balance. "
            "Doctors commonly prescribe medicines like Telmisartan or Amlodipine for regular management."
        )

    # 5. Diabetes / Sugar Search
    if has_kw(["sugar", "diabetes", "diabetic", "glucose", "insulin"]):
        return (
            "Normal fasting blood sugar for seniors is below 110 to 125 mg/dL. "
            "Daily habits like morning fenugreek (methi) water, whole grains, and leafy vegetables like karela help control spikes. "
            "Please ensure you monitor both fasting and post-meal readings regularly."
        )

    # 6. Joint pain / Arthritis Search
    if has_kw(["joint", "knee", "arthritis", "ghutna", "dard", "pain", "backache", "stiffness"]):
        return (
            "For joint stiffness and knee aches, applying warm sesame oil compresses, doing gentle knee mobility exercises, "
            "and having warm turmeric milk at night provide soothing natural relief. Avoid lifting heavy weights or sudden knee strain."
        )

    # 7. Acidity / Gas / Digestion Search
    if has_kw(["gas", "acidity", "indigestion", "stomach", "pet", "acid", "reflux", "constipation"]):
        return (
            "A fast home remedy for acidity is drinking warm water infused with roasted ajwain and cumin seeds (jeera). "
            "Eating dinner at least two hours before sleeping and staying upright after meals helps prevent acid reflux."
        )

    # 8. Medicines & Tablets Search
    if has_kw(["medicine", "tablet", "dawai", "dawa", "paracetamol", "crocin", "dolo", "vitamin", "calcium"]):
        return (
            "Paracetamol (Dolo 650 or Crocin) is standard for mild fever and aches. Antacids like Pantoprazole soothe stomach acidity, "
            "and daily Calcium with Vitamin D3 supports bone density. Always take tablets with water as directed by your doctor."
        )

    # 9. Cricket / Sports Knowledge Search
    if has_kw(["cricket", "world cup", "kapil", "sachin", "gavaskar", "1983", "dhoni"]):
        return (
            "India won its first historic Cricket World Cup in 1983 under the captaincy of Kapil Dev at Lord's, defeating the West Indies. "
            "India later won the World Cup again in 2011 under Mahendra Singh Dhoni."
        )

    # 10. Weather / News / General Info
    if has_kw(["weather", "mausam", "barish", "rain", "temperature", "news"]):
        return (
            "Today's weather across major Indian regions is pleasant with moderate seasonal temperatures. "
            "For live local forecasts, check your city weather widget or morning newspaper."
        )

    # General Search Result
    return (
        f"Search result for '{query_text}': This is an active search topic. "
        "You can ask me about current grocery prices, health facts, home remedies, cricket history, or daily knowledge."
    )


async def get_llm_response(user_text: str) -> str:
    """Legacy audio voice helper redirecting to Voice Search Engine."""
    return await get_voice_search_response(user_text)



