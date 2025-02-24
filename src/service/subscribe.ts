export async function subscribe(email: string) {
  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    const data = await response.json();

    if (response.ok) {
      return { success: true, ...data };
    } else {
      return { success: false, ...data };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return { success: false, error };
  }
}
