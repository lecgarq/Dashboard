import { UTApi } from "uploadthing/server";
import { readFileSync } from "node:fs";

// Explicit token for one-off upload
const utapi = new UTApi({
  token: "eyJhcGlLZXkiOiJza19saXZlXzY1NzY1OTU5NzVkZWRhZWNjNzlkYTI4ZjQ1OGEzM2E0ZTYxZWJhNzgzZjMxZDVmZTliNTFiYmJiNDk5ODFlZWMiLCJhcHBJZCI6IjF4cDEzd3pycmMiLCJyZWdpb25zIjpbInNlYTEiXX0="
});

const AVATAR_PATH = `C:\\Users\\luis.cortes\\.gemini\\antigravity\\brain\\4dd2f85a-aeba-4b33-95d1-7e30cfea4186\\le_cg_avatar_square_1775599580431.png`;

async function uploadAvatar() {
  try {
    console.log("Reading avatar file...");
    const fileBuffer = readFileSync(AVATAR_PATH);
    const fileName = "le_cg_avatar.png";
    const fileType = "image/png";

    // Create a File object (Node.js 20+ supports the native File API)
    const file = new File([fileBuffer], fileName, { type: fileType });

    console.log("Uploading to UploadThing...");
    const response = await utapi.uploadFiles(file);

    if (response.data) {
      console.log("Success! Uploaded URL (ufsUrl):", response.data.ufsUrl);
      console.log("File Key:", response.data.key);
    } else {
      console.error("Upload failed:", response.error);
    }
  } catch (error) {
    console.error("Error during upload:", error);
  }
}

uploadAvatar();
