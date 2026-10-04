const response = await fetch("http://127.0.0.1:4173/__sandbox/stop", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
if (!response.ok) throw new Error(`Local shutdown returned ${response.status}`);
console.log("Local wallet shutdown requested.");
export {};
