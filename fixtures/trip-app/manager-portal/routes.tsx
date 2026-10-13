import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Approvals from './Approvals';

export default function ManagerRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/approvals" element={<Approvals />} />
      </Routes>
    </BrowserRouter>
  );
}
