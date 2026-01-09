import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import RequireAuth from "./RequireAuth";

import Login from "./pages/Login";
import Calendar from "./pages/Calendar";
import Convert from "./pages/Convert";
import Settings from "./pages/Settings";
import EventForm from "./pages/EventForm";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Calendar />} />
          <Route path="/convert" element={<Convert />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/events/new" element={<EventForm />} />
          <Route path="/events/:id/edit" element={<EventForm />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
