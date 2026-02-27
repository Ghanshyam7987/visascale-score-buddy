import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Use Gemini image model to remove background
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a photo background removal tool. Your ONLY job is to replace the background with solid pure white (#FFFFFF).

CRITICAL RULES:
1. Keep the EXACT same image dimensions - do NOT crop or resize
2. Keep the EXACT same person position, size, and framing
3. Do NOT alter ANY facial features, skin, hair, eyes, clothing, or any part of the person
4. Do NOT zoom in or zoom out
5. ONLY change background pixels to pure white (#FFFFFF)
6. The person must remain at the EXACT same position and scale as in the original
7. Output image must have the SAME resolution as input

Think of this as a mask operation: person stays identical, background becomes white.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Response keys:", JSON.stringify(Object.keys(data)));
    console.log("Choices structure:", JSON.stringify(data.choices?.map((c: any) => ({
      hasImages: !!c.message?.images,
      imageCount: c.message?.images?.length,
      contentLength: c.message?.content?.length,
    }))));

    // Try multiple response formats
    let resultImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!resultImage) {
      // Check if image is in content array
      const content = data.choices?.[0]?.message?.content;
      if (Array.isArray(content)) {
        const imgPart = content.find((p: any) => p.type === 'image_url');
        resultImage = imgPart?.image_url?.url;
      }
    }

    if (!resultImage) {
      console.error("Full response:", JSON.stringify(data).substring(0, 2000));
      throw new Error("No image returned from AI model");
    }

    return new Response(JSON.stringify({ processedImage: resultImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
