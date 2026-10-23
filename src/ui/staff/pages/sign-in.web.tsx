/** /staff/sign-in: the sign-in form on its own address; a staff session continues to the overview. */
import { Redirect } from 'expo-router';

import { useStaffSession } from '@/services/staff';
import { SignInForm } from '@/ui/staff/SignInForm';

export default function StaffSignIn() {
  const session = useStaffSession();
  if (session.status === 'staff') return <Redirect href="/staff" />;
  return <SignInForm notStaff={session.status === 'notStaff'} />;
}
