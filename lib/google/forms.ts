import "server-only";
import { google } from "googleapis";
import fs from "node:fs";

interface ExamQuestion {
  text: string;
  type: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "PARAGRAPH";
  options?: string[];
  required?: boolean;
}

function getServiceAccountAuth() {
  const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (keyFilePath && fs.existsSync(keyFilePath)) {
    const keyFile = JSON.parse(fs.readFileSync(keyFilePath, "utf-8"));
    return new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: [
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  if (!email || !privateKey) {
    throw new Error(
      "Google Service Account credentials not configured."
    );
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: [
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/forms.responses.readonly",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

export async function createGoogleForm(
  title: string,
  description: string | undefined,
  questions: ExamQuestion[]
): Promise<{ formId: string; formUrl: string }> {
  const auth = getServiceAccountAuth();
  const forms = google.forms({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // 1. Create the form file using DRIVE API (to bypass service account quota)
  // This allows us to create the file directly in a folder/shared drive.
  const driveRes = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.form",
      parents: folderId ? [folderId] : undefined,
    },
    supportsAllDrives: true,
    fields: "id",
  });

  const formId = driveRes.data.id!;

  // 2. Fetch the responder URL (Forms API)
  const formInfo = await forms.forms.get({ formId });
  const formUrl = formInfo.data.responderUri!;

  // 3. Update title, description and add questions via batchUpdate
  const requests: any[] = [];
  
  // Note: We update title here because Drive API only sets the filename,
  // whereas the Forms API sets the internal title.
  requests.push({
    updateFormInfo: { 
      info: { 
        title,
        description: description || ""
      }, 
      updateMask: "title,description" 
    },
  });

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const question: any = { required: q.required ?? true };

    if (q.type === "MULTIPLE_CHOICE" && q.options?.length) {
      question.choiceQuestion = {
        type: "RADIO",
        options: q.options.map((opt) => ({ value: opt })),
      };
    } else if (q.type === "PARAGRAPH") {
      question.textQuestion = { paragraph: true };
    } else {
      question.textQuestion = { paragraph: false };
    }

    requests.push({
      createItem: {
        item: {
          title: q.text,
          questionItem: { question },
        },
        location: { index: i },
      },
    });
  }

  if (requests.length > 0) {
    await forms.forms.batchUpdate({
      formId,
      requestBody: { requests },
    });
  }

  return { formId, formUrl };
}

export async function getFormResponses(formId: string) {
  const auth = getServiceAccountAuth();
  const forms = google.forms({ version: "v1", auth });
  try {
    const res = await forms.forms.responses.list({ formId });
    return res.data.responses ?? [];
  } catch (error: any) {
    if (error?.code === 404 || error?.code === 403) return [];
    throw error;
  }
}
