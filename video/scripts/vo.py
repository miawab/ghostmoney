# Generates the voiceover (one mp3 per scene) with Microsoft's free neural voices.
import asyncio, json, edge_tts
VOICE = "en-US-AndrewMultilingualNeural"
LINES = {
 "s1": "Say you could cross over to the land of the dead, for one night, and meet your whole family.",
 "s2": "They'd have opinions, obviously. You've gotten so thin. Eat something. When's the wedding.",
 "s3": "And honestly? I'd only have one question. Did you leave any hidden treasure?",
 "s4": "Turns out I don't need the bridge. Pakistan's banks have already handed fifty billion rupees, in people's names, over to the State Bank.",
 "s5": "Leave an account untouched long enough, and it goes on a public list. In 782 files. So the treasure map exists. It's just a really bad map.",
 "s6": "Ctrl F puts the right account first only 51 percent of the time. Because some clerk wrote Mohd Rasul, and went to lunch.",
 "s7": "Ghost Money searches them all at once. And the name you type never leaves your browser.",
 "s8": "Your browser works out the spellings, downloads one small piece of the index, and compares every row. TabPFN scores each one from twelve numbers. Gemma, running on this PC, gives a second opinion.",
 "s9": "And it's honest. Fifteen thousand accounts belong to a Ghulam Rasool. It tells you that, and tells you a CNIC or a father's name will settle it.",
 "s10": "Then it finds the branch and drafts the letter. No agent, no fee. You go to the bank yourself.",
 "s11": "And it reads the result out loud, in Urdu.",
 "s12": "Right account first, 77 percent of the time. 99, when the father's name is on the record.",
 "s13": "So you can skip the trip. But maybe still eat something.",
}
async def main():
    for k, text in LINES.items():
        await edge_tts.Communicate(text, VOICE).save(f"public/vo/{k}.mp3")
    json.dump(LINES, open("public/vo/lines.json", "w"), indent=1)
asyncio.run(main())
