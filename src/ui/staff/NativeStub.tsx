/**
 * The staff dashboard is web only (plan: no staff code in the phone binary). Expo Router bundles every file in src/app on
 * every platform, so each /staff route file is a one-line re-export of src/ui/staff/pages/<page>; Metro resolves that to
 * <page>.web.tsx on the web and to this stub on a phone, which goes home.
 */
import { Redirect } from 'expo-router';

export default function StaffNativeStub() {
  return <Redirect href="/" />;
}
