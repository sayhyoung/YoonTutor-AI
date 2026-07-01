"use client";

import { LoginScreen } from "@/components/login-screen";
import { TutorPrototype } from "@/components/tutor-prototype";
import { useAppUser } from "@/lib/auth/use-app-user";

export default function Home() {
  const {
    appUser,
    loginAsStudent,
    loginWithStudyApi,
    loginAsTeacher,
    loginAsTeacherApi,
    logout,
  } = useAppUser();

  if (!appUser) {
    return (
      <LoginScreen
        onLoginStudent={loginAsStudent}
        onLoginStudentCredentials={loginWithStudyApi}
        onLoginTeacher={loginAsTeacher}
        onLoginTeacherCredentials={loginAsTeacherApi}
      />
    );
  }

  return <TutorPrototype appUser={appUser} onLogout={logout} />;
}
