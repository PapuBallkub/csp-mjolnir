import Link from "next/link";
import { btn } from "../_components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-muted mb-4 text-xl">
        🔍
      </div>
      <h1 className="text-xl font-bold text-ink">ไม่พบข้อมูลประกาศจัดซื้อจัดจ้างนี้</h1>
      <p className="mt-2 text-sm text-ink-muted">
        รหัสโครงการนี้อาจไม่มีอยู่ในระบบ หรือยังไม่ได้ถูกประมวลผลผ่านระบบวิเคราะห์ TOR
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/search" className={btn.primary}>
          กลับไปยังหน้ารายการประกาศ
        </Link>
      </div>
    </div>
  );
}
