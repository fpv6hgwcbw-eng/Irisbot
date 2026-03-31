import fs from "fs";
import path from "path";

const DATA_FILE = path.resolve(process.cwd(), "data/applications.json");

export interface Application {
  id: string;
  userId: number;
  username: string;
  displayName: string;
  gameId: string;
  damage: number;
  comment: string;
  createdAt: string;
}

function ensureFile(): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), "utf-8");
  }
}

export function loadApplications(): Application[] {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Application[];
  } catch {
    return [];
  }
}

export function saveApplications(apps: Application[]): void {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(apps, null, 2), "utf-8");
}

export function addApplication(app: Omit<Application, "id" | "createdAt">): Application {
  const apps = loadApplications();
  const newApp: Application = {
    ...app,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  };
  apps.push(newApp);
  saveApplications(apps);
  return newApp;
}

export function deleteApplication(userId: number): boolean {
  const apps = loadApplications();
  const idx = apps.findIndex((a) => a.userId === userId);
  if (idx === -1) return false;
  apps.splice(idx, 1);
  saveApplications(apps);
  return true;
}

export function clearAllApplications(): void {
  saveApplications([]);
}

export function getApplicationByUser(userId: number): Application | undefined {
  return loadApplications().find((a) => a.userId === userId);
}
