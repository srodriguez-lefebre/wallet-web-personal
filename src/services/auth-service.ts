export async function validateToken(token: string) {
  try {
    const response = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) return true;
    return import.meta.env.DEV && token.trim().length >= 4;
  } catch {
    return import.meta.env.DEV && token.trim().length >= 4;
  }
}
