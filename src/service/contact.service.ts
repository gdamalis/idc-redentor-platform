import { ContactDetails } from "@src/types/ContactDetails";
import { connect } from "./database.service";

export async function sendContactForm(contactDetails: ContactDetails) {
  const client = await connect();
  if (!client) {
    throw new Error("Failed to connect to database");
  }
  
  try {
    const db = client.db("website");
    const collection = db.collection("contact");
    
    // Add timestamp
    const documentToInsert = {
      ...contactDetails,
      createdAt: new Date()
    };
    
    // Wait for the insertion to complete and return the result
    const result = await collection.insertOne(documentToInsert);
    
    // Verify that the insertion was successful
    if (!result.acknowledged) {
      throw new Error("Database operation failed");
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error saving contact form data:", error);
    throw error;
  }
}

export async function getContactMessages() {
  const client = await connect();
  if (!client) {
    throw new Error("Failed to connect to database");
  }

  try {
    const db = client.db("website");
    const collection = db.collection("contact");

    return await collection.find().sort({ createdAt: -1 }).toArray();
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    throw error;
  }
}
