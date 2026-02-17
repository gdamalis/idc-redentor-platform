import mailchimp from "@mailchimp/mailchimp_marketing";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const apiKey = process.env.MAILCHIMP_API_KEY;
    const server = process.env.MAILCHIMP_API_SERVER;
    const audienceId = process.env.MAILCHIMP_AUDIENCE_ID ?? "";

    mailchimp.setConfig({
      apiKey,
      server,
    });

    const response = await mailchimp.lists.addListMember(audienceId, {
      email_address: email,
      status: "subscribed",
    });

    if (!response.status) {
      return NextResponse.json({ status: response.status });
    }

    return NextResponse.json(
      { message: "Successfully subscribed!" },
      { status: 200 },
    );
     
  } catch (error: unknown) {
    // Type narrowing for Mailchimp error
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "error" in error.response &&
      error.response.error &&
      typeof error.response.error === "object" &&
      "text" in error.response.error &&
      typeof error.response.error.text === "string"
    ) {
      try {
        const errorData = JSON.parse(error.response.error.text);
        if (errorData?.title === "Member Exists") {
          return NextResponse.json(
            { message: "Email is already subscribed" },
            { status: "status" in error && typeof error.status === "number" ? error.status : 400 },
          );
        }
      } catch {
        // If JSON parsing fails, fall through to generic error
      }
    }

    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
