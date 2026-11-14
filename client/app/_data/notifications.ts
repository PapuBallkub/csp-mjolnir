export type NotificationType = "match";

export type MatchedTorSummary = {
  projectId: string;
  projectTitle: string;
  agency: string;
  budget: number;
  matchScore: number;
  matchedSkills: string[];
  daysLeft?: number;
  submissionDeadline?: string;
  status?: "Open" | "Draft" | "Awarded" | "Closed";
  isAmended?: boolean;
};

export type NotificationSnapshot = {
  projectId?: string;
  projectTitle?: string;
  agency?: string;
  budget?: number;
  matchScore?: number;
  matchedSkills?: string[];
  matchedItems: MatchedTorSummary[];
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: { th: string; en: string };
  body: { th: string; en: string };
  createdAt: string;
  isRead: boolean;
  targetUrl: string;
  snapshot: NotificationSnapshot;
};

export const INITIAL_MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-001",
    type: "match",
    title: {
      th: "พบ 3 โครงการใหม่ที่ตรงกับโปรไฟล์ของคุณ",
      en: "Found 3 new tenders matching your profile",
    },
    body: {
      th: "ระบบตรวจพบ 3 โครงการจัดซื้อจัดจ้างภาครัฐล่าสุดที่มีทักษะตรงกับคุณ เช่น Next.js, Node.js, PostgreSQL และ Kubernetes",
      en: "Detected 3 recent procurement opportunities matching your skills (Next.js, Node.js, PostgreSQL, Kubernetes).",
    },
    createdAt: "2026-11-03T10:30:00.000Z",
    isRead: false,
    targetUrl: "/notifications/notif-001",
    snapshot: {
      matchedItems: [
        {
          projectId: "69069041234",
          projectTitle: "จ้างพัฒนาระบบบริการประชาชนออนไลน์ (e-Service Portal)",
          agency: "สำนักงานเขตจตุจักร กรุงเทพมหานคร",
          budget: 3200000,
          matchScore: 88,
          matchedSkills: ["Next.js", "Node.js", "PostgreSQL", "Docker", "Tailwind CSS"],
          daysLeft: 12,
          status: "Open",
        },
        {
          projectId: "69079055432",
          projectTitle: "จ้างพัฒนาระบบตรวจวัดระดับน้ำท่วมและเตือนภัยอัจฉริยะ (IoT Flood Monitoring)",
          agency: "สำนักการระบายน้ำ กรุงเทพมหานคร",
          budget: 15400000,
          matchScore: 84,
          matchedSkills: ["TypeScript", "Node.js", "Kubernetes", "IoT"],
          daysLeft: 8,
          status: "Open",
          isAmended: true,
        },
        {
          projectId: "69059011999",
          projectTitle: "จ้างพัฒนาระบบบริหารจัดการคิวและนัดหมายผู้ป่วยผ่าน LINE Official Account",
          agency: "สำนักการแพทย์ กรุงเทพมหานคร",
          budget: 4800000,
          matchScore: 81,
          matchedSkills: ["React", "Node.js", "PostgreSQL", "LINE API"],
          daysLeft: 3,
          status: "Open",
        },
      ],
    },
  },
  {
    id: "notif-002",
    type: "match",
    title: {
      th: "พบ 2 โครงการที่ตรงกับโปรไฟล์ของคุณ (รอบประมวลผลก่อนหน้า)",
      en: "Found 2 tenders matching your profile (Previous batch)",
    },
    body: {
      th: "สรุปโครงการจัดซื้อจัดจ้างเทคโนโลยีที่มีคะแนนความเข้ากันได้เกิน 75% จากรอบการรวบรวมก่อนหน้า",
      en: "Summary of matching IT procurement tenders scoring over 75% from the previous collection cycle.",
    },
    createdAt: "2026-10-31T15:00:00.000Z",
    isRead: true,
    targetUrl: "/notifications/notif-002",
    snapshot: {
      matchedItems: [
        {
          projectId: "69089022111",
          projectTitle: "จ้างปรับปรุงระบบบริหารจัดการข้อมูลสุขภาพและเวชระเบียนดิจิทัล (EMR)",
          agency: "โรงพยาบาลราชวิถี กรมการแพทย์",
          budget: 6800000,
          matchScore: 82,
          matchedSkills: ["Node.js", "PostgreSQL", "Next.js", "Docker"],
          daysLeft: 0,
          status: "Closed",
        },
        {
          projectId: "69099033444",
          projectTitle: "จ้างจัดทำระบบ Portal ติดตามสถานะและเบิกจ่ายงบประมาณโครงการ",
          agency: "กรมบัญชีกลาง กระทรวงการคลัง",
          budget: 2400000,
          matchScore: 78,
          matchedSkills: ["React", "TypeScript", "Tailwind CSS"],
          daysLeft: 0,
          status: "Awarded",
        },
      ],
    },
  },
];
