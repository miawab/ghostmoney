// Finds a sample search that gets a normal result (with the Listen buttons). Prints counts only.
import { chromium } from "playwright";
const tries = [["Allah Ditta","Ghulam Muhammad","Multan"],["Muhammad Ramzan","Allah Bakhsh","Lahore"],["Abdul Sattar","Noor Muhammad","Karachi"],["Fazal Karim","Rahim Bakhsh","Peshawar"],["Shafqat Mehmood","Ghulam Hussain","Lahore"],["Nazir Ahmad","Karam Din","Sialkot"],["Bashir Ahmed","Khuda Bakhsh","Sukkur"],["Rafiq Masih","Inayat Masih","Lahore"]];
const b = await chromium.launch(); const p = await b.newPage();
await p.route("**/api/gemma", r => r.abort());
for (const [n,f,c] of tries) {
  await p.goto("http://localhost:8000/");
  await p.fill("#fName",n); await p.fill("#fFather",f); await p.fill("#fCity",c);
  await p.click("#goBtn");
  await p.waitForFunction(()=>!document.getElementById("results").hidden,{timeout:90000}).catch(()=>{});
  const r = await p.evaluate(()=>{const cs=[...document.querySelectorAll("#cards .acct")];return {cards:cs.length,listen:document.querySelectorAll("#summary [data-lang]").length,withBranch:cs.filter(x=>!x.querySelector(".where").innerText.includes("branch not given")).length}});
  console.log(tries.findIndex(t=>t[0]==n),JSON.stringify(r));
}
await b.close();
