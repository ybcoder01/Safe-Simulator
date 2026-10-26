import { Suspense } from "react";
import { CreateWizard } from "@/components/create-wizard";

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateWizard />
    </Suspense>
  );
}
