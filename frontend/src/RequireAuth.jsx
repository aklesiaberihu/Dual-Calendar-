import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getToken } from "./api";

export default function RequireAuth({ children }) {
  const [token, setToken] = useState(getToken());
  const navigate = useNavigate();

  useEffect(() => {

    function checkToken() {
      const newToken = getToken();
      if (!newToken) {
        setToken("");
        navigate("/login", { replace: true });
      } else {
        setToken(newToken);
      }
    }

    window.addEventListener("storage", checkToken);

    const interval = setInterval(checkToken, 300);

    return () => {
      window.removeEventListener("storage", checkToken);
      clearInterval(interval);
    };
  }, [navigate]);

  if (!token) return <Navigate to="/login" replace />;
  return children;
}
