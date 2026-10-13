import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TripScreen from './TripScreen';

export default function DriverRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/trip/:id" element={<TripScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
