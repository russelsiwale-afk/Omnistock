
import { GoogleGenAI, Type } from "@google/genai";
import { Product, ShopInfo } from "../types";

// Always use the required initialization pattern
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || 'FAKE_API_KEY_FOR_DEVELOPMENT' });

export const getAIInventoryAnalysis = async (products: Product[], shop: ShopInfo) => {
  const prompt = `
    Act as a professional business accountant and friendly business advisor.
    Analyze the following shop data and provide a concise executive summary.
    
    IMPORTANT: Use simple, easy-to-understand language. Avoid complex accounting jargon. 
    Explain things like you are talking to a business owner who wants clear, direct advice.

    Shop Name: ${shop.name}
    Manager: ${shop.manager}
    Staff Count: ${shop.workersCount}
    
    Inventory Data:
    ${JSON.stringify(products.map(p => ({
      name: p.name,
      purchased: p.quantityPurchased,
      sold: p.quantitySold,
      stock: p.quantityPurchased - p.quantitySold,
      price: p.price
    })))}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "Provide a simple executive summary. Focus on how the business is doing, if they have enough stock, what is selling well, and 3 simple tips to make more money. Keep it encouraging and clear.",
      }
    });
    // Accessing .text property directly as per latest SDK
    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Unable to generate AI summary at this time. Please check your connectivity and API key.";
  }
};
