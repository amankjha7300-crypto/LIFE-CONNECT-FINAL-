import os
import asyncio

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

openai_api_key = os.getenv("OPENAI_API_KEY")

async def get_llm_chat_response(messages: list) -> str:
    """Call OpenAI GPT to get a response for the given chat history.
    Trained with deep domain knowledge for illnesses, medicines, and daily necessity prices.
    If OpenAI is not configured, returns an intelligent domain-matched fallback response.
    """
    if OPENAI_AVAILABLE and openai_api_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_api_key)
            
            system_prompt = {
                "role": "system",
                "content": (
                    "You are 'Mitra' (or the selected companion 'Guru'/'Saheli') on LifeConnect, an expert, warm, and empathetic AI voice companion designed for senior citizens (50+ years old) in India.\n\n"
                    "CORE KNOWLEDGE BASE & TRAINING:\n"
                    "1. ILLNESSES & CHRONIC CONDITIONS:\n"
                    "- Hypertension / High Blood Pressure: Normal range for seniors (~120-130/80 mmHg). Advise low sodium intake, morning walks, stress management (Pranayama/deep breathing), avoiding sudden exertion. Warning signs: severe headache, dizziness, blurry vision.\n"
                    "- Type 2 Diabetes (Sugar): Fasting target (<110-125 mg/dL), Post-meal (<140-180 mg/dL). Recommend low glycemic foods (methi seeds, whole wheat/multigrain, jamun, karela), daily 30-min walking, avoiding refined sugar/sweets, daily foot care.\n"
                    "- Arthritis & Joint/Knee Pain: Age-related osteoarthritis, stiffness. Advise warm compresses, gentle knee/joint mobility stretches, haldi doodh (turmeric milk), calcium & Vitamin D intake, avoiding sitting cross-legged for too long.\n"
                    "- Acidity, Gas & Indigestion: Very common with aging. Recommend drinking warm ajwain or jeera water, light early dinners at least 2 hours before bed, sitting upright after meals, avoiding spicy/fried snacks.\n"
                    "- Seasonal Cold, Cough & Flu: Steam inhalation with tulsi or eucalyptus, ginger-tulsi-honey decoction (kadha), warm water sips, rest.\n"
                    "- MEDICAL SAFETY RULE: Always provide comforting, knowledgeable explanations and home wellness care, but clearly remind the user to consult their family physician or doctor for specific prescriptions and medical decisions.\n\n"
                    "2. MEDICINES & MEDICATION MANAGEMENT:\n"
                    "- Blood Pressure: Common medicines include Telmisartan (Telma), Amlodipine (Amlong), Losartan. Advise taking at a fixed time daily, usually in the morning.\n"
                    "- Diabetes: Metformin (Glycomet), Glimepiride (Amaryl), Teneligliptin. Taken strictly with or before meals as advised.\n"
                    "- Pain & Fever: Paracetamol (Crocin / Dolo 650) for mild fever and body aches. Topical pain relief gels (Volini, Moov). Advise avoiding excessive NSAID painkillers without a doctor's advice due to kidney/stomach considerations.\n"
                    "- Acidity & Stomach: Pantoprazole (Pan 40), Omeprazole (Omez), antacid syrups like Digene / Gelusil after heavy meals.\n"
                    "- Supplements: Vitamin D3 (60,000 IU weekly sachets or capsules), Calcium with Vitamin D3 (Shelcal 500), B-Complex (Becosules) for nerve vitality and energy.\n"
                    "- Medication Tips: Use a labeled 7-day pill organizer box, never skip doses, take tablets with plenty of water, keep emergency doctor contacts handy.\n\n"
                    "3. DAILY NECESSITIES, GROCERIES & MARKET PRICES (INDIAN RETAIL BENCHMARK ₹):\n"
                    "- Milk & Dairy: Full Cream Milk ₹66-72/L (Amul Gold, Mother Dairy), Toned/Cow Milk ₹54-58/L, Fresh Curd/Dahi ₹35-45 per 400g/500g, Paneer ₹90-120 per 200g.\n"
                    "- Salt, Sugar, Tea & Spices: Iodized Table Salt (Tata Salt) ₹25-30/kg, Sendha Namak (Rock Salt) ₹40-60/kg, Refined Sugar ₹42-46/kg, Organic Jaggery/Gud ₹60-85/kg, Premium Tea (Tata Tea Gold, Red Label) ₹120-160 per 250g pouch, Turmeric Powder ₹35-50 per 100g.\n"
                    "- Grains & Pulses: Whole Wheat Atta (Aashirvaad/Chakki) ₹38-48/kg (10kg bag ₹380-460), Everyday Rice ₹45-65/kg, Premium Basmati Rice ₹95-150/kg, Toor/Arhar Dal ₹150-180/kg, Moong Dal ₹110-135/kg, Chana Dal ₹85-105/kg.\n"
                    "- Cooking Oils & Ghee: Mustard Oil (Kachchi Ghani) ₹140-175/L, Refined Sunflower/Soybean Oil ₹135-165/L, Pure Desi Cow Ghee ₹550-750/L.\n"
                    "- Fresh Vegetables (Mandi rates): Potatoes (Aloo) ₹25-35/kg, Onions (Pyaz) ₹30-45/kg, Tomatoes (Tamatar) ₹25-45/kg (seasonal), Ginger (Adrak) ₹120-180/kg, Garlic (Lahsun) ₹180-260/kg, Green Leafy Vegetables (Palak, Methi) ₹20-40 per bunch, Lauki/Gourd ₹30-45/kg, Bhindi (Okra) ₹35-55/kg.\n"
                    "- Fresh Fruits: Bananas ₹45-65 per dozen, Apples ₹120-200/kg, Papaya ₹40-60/kg, Oranges/Mosambi ₹60-90/kg.\n\n"
                    "COMMUNICATION STYLE & TONE:\n"
                    "- Respond warmly in 2 to 4 complete, conversational sentences.\n"
                    "- Use natural, spoken English (with familiar Indian touches like 'Ji' or Hindi terms where fitting) suitable for text-to-speech voice output.\n"
                    "- Be polite, clear, and reassuring. Never give robotic one-liners."
                )
            }
            
            # Ensure the system prompt is always at the beginning
            formatted_messages = [system_prompt] + [m for m in messages if m.get("role") != "system"]
            
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=formatted_messages,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI error: {e}")
            # Fall through to mock
            
    # Smart Domain Knowledge Fallback (When OpenAI key is not set or network offline)
    await asyncio.sleep(0.8)
    last_msg = (messages[-1]["content"] if messages else "").lower()
    
    # 1. Milk & Dairy queries
    if any(k in last_msg for k in ["milk", "doodh", "dairy", "paneer", "curd", "dahi"]):
        return (
            "Currently in the local market, full cream milk like Amul Gold or Mother Dairy is around ₹66 to ₹72 per liter, "
            "while toned or cow milk is approximately ₹54 to ₹58 per liter. "
            "Fresh paneer is about ₹90 to ₹120 for 200 grams. Would you like price details on any other daily grocery items?"
        )
    
    # 2. Salt, Sugar, Tea & Spices
    if any(k in last_msg for k in ["salt", "namak", "sugar", "cheeni", "tea", "chai", "ghee", "oil", "tel"]):
        return (
            "Tata Salt and standard iodized salt are currently around ₹25 to ₹30 per kilogram, while rock salt or Sendha Namak is about ₹40 to ₹60. "
            "Refined sugar is selling at ₹42 to ₹46 per kilo, cooking mustard oil is roughly ₹140 to ₹170 per liter, and pure desi ghee is ₹550 to ₹700. "
            "Let me know if you need rates for flour, rice, or pulses as well."
        )
        
    # 3. Vegetables & Fruits
    if any(k in last_msg for k in ["vegetable", "sabzi", "sabji", "potato", "aloo", "onion", "pyaz", "tomato", "tamatar", "fruit", "kela", "banana", "apple", "seb", "price", "rate", "bhav", "cost"]):
        return (
            "In the local vegetable mandi today, potatoes (aloo) are around ₹25 to ₹35 per kilo, onions (pyaz) are ₹30 to ₹45, and tomatoes (tamatar) range between ₹25 to ₹40 depending on quality. "
            "Fresh green vegetables like palak, lauki, and bhindi are between ₹30 to ₹50 per kilo, and bananas are about ₹45 to ₹60 a dozen."
        )
        
    # 4. Blood Pressure / Hypertension
    if any(k in last_msg for k in ["bp", "blood pressure", "hypertension", "high pressure"]):
        return (
            "For seniors, maintaining a steady blood pressure around 120 to 130 over 80 mmHg is ideal. "
            "Limiting sodium and table salt, practicing daily morning walks, and having calming herbal teas help greatly. "
            "Common medicines prescribed by doctors include Telmisartan or Amlodipine. Please make sure to check your BP regularly and follow your doctor's exact prescription."
        )

    # 5. Diabetes / Sugar
    if any(k in last_msg for k in ["sugar", "diabetes", "diabetic", "glucose", "insulin"]):
        return (
            "Managing blood sugar is all about consistent routines. Incorporating methi seeds water, whole grains, and leafy vegetables like karela helps regulate glucose levels. "
            "Doctors commonly prescribe Metformin or related tablets with meals. Remember to keep checking your fasting and post-meal sugar levels, and always follow your physician's advice."
        )

    # 6. Joint pain / Arthritis
    if any(k in last_msg for k in ["joint", "knee", "arthritis", "ghutna", "dard", "pain", "backache", "stiffness"]):
        return (
            "Joint stiffness and knee aches are very common as we mature. Warm sesame or mustard oil massage, gentle knee flexion exercises, and warm turmeric milk at night can provide wonderful relief. "
            "For acute pain, topical gels like Volini or mild paracetamol are often used, but do consult your doctor before starting any regular pain medications."
        )

    # 7. Acidity / Gas / Digestion
    if any(k in last_msg for k in ["gas", "acidity", "indigestion", "stomach", "pet", "acid", "reflux", "constipation"]):
        return (
            "For gentle digestive comfort, sipping warm water infused with roasted ajwain and jeera works wonders. "
            "Try having your dinner at least two hours before sleeping and avoid very spicy or oily foods. "
            "If you experience frequent acid reflux, antacids like Pantoprazole or Gelusil are commonly recommended by doctors."
        )

    # 8. Medicines & Tablets
    if any(k in last_msg for k in ["medicine", "tablet", "dawai", "dawa", "paracetamol", "crocin", "dolo", "vitamin", "calcium"]):
        return (
            "Common everyday medicines include Paracetamol (Dolo 650 or Crocin) for mild aches or fever, Pantoprazole for acidity, and daily supplements like Calcium with Vitamin D3 and B-Complex for vitality. "
            "Always keep your medicines organized in a weekly pill organizer, take them with lukewarm water, and never alter dosages without consulting your doctor or pharmacist."
        )

    # General fallback
    return (
        f"I'm right here with you. Whether you'd like to check today's grocery and vegetable prices, "
        "talk about healthy daily habits and remedies, or discuss your favorite memories and music, "
        "I am ready to help. What would you like to explore today?"
    )

async def get_llm_response(user_text: str) -> str:
    """Legacy endpoint for single text strings (used by voice router)."""
    return await get_llm_chat_response([{"role": "user", "content": user_text}])

