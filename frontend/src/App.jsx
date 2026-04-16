import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import RequireAuth from "./RequireAuth";

import Welcome from "./pages/Welcome";
import Login from "./pages/Login";
import Calendar from "./pages/Calendar";
import Convert from "./pages/Convert";
import Settings from "./pages/Settings";
import EventForm from "./pages/EventForm";
import EventDiff from "./pages/EventDiff";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/app" element={<Calendar />} />
          <Route path="/convert" element={<Convert />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/events/new" element={<EventForm />} />
          <Route path="/events/:id/edit" element={<EventForm />} />
          <Route path="/events/:id/diff" element={<EventDiff />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}