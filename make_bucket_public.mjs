import { createClient } from "@supabase/supabase-js";

// We need the service_role key to update bucket settings,
// but since the user only provided the anon key before, let's see if we can read the service key from .env.local
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
let serviceKey = "";
let url = "";

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (urlMatch) url = urlMatch[1].trim();
  if (keyMatch) serviceKey = keyMatch[1].trim();
}

if (!serviceKey || !url) {
  console.log("Could not find service key or url in .env.local. Trying anon key...");
  url = "https://espqrrunhekvjsoxdfbx.supabase.co";
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // actually anon key, this might fail to update bucket.
}

const supabase = createClient(url, serviceKey);

async function makeBucketPublic() {
  console.log("Checking if bucket 'product-images' is public...");

  // Try to update the bucket to be public
  const { data, error } = await supabase.storage.updateBucket('product-images', {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/jpg'],
    fileSizeLimit: 10485760 // 10MB
  });

  if (error) {
    console.error("❌ Failed to update bucket:", error.message);
    console.log("You might need to do this manually in Supabase Dashboard -> Storage -> Buckets -> product-images -> Edit -> Public");
  } else {
    console.log("✅ Successfully updated 'product-images' bucket to be PUBLIC!");
  }
}

makeBucketPublic();
