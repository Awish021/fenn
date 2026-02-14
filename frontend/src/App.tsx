import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { CategoriesPage } from "./pages/CategoriesPage";
import { GroupsPage } from "./pages/GroupsPage";
import { ItemsPage } from "./pages/ItemsPage";
import { LoginPage } from "./pages/LoginPage";
import { VennPage } from "./pages/VennPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/groups" replace />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:groupId/categories" element={<CategoriesPage />} />
        <Route path="categories/:categoryId/items" element={<ItemsPage />} />
        <Route path="categories/:categoryId/venn" element={<VennPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
