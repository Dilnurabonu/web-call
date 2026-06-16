import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Live from "./pages/Live";
import CDR from "./pages/CDR";
import Audit from "./pages/Audit";
import Users from "./pages/Users";
import Integrations from "./pages/Integrations";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/live" element={<Live />} />
            <Route path="/calls" element={<CDR />} />
            <Route
              path="/audit"
              element={
                <ProtectedRoute roles={["admin", "supervisor"]}>
                  <Audit />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/integrations"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Integrations />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
