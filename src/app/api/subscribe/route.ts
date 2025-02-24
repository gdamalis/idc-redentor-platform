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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (JSON.parse(error?.response?.error?.text)?.title === "Member Exists") {
      return NextResponse.json(
        { message: "Email is already subscribed" },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
