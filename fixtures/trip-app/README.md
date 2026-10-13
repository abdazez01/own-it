# Trip App

Trip App is a cargo-lock trip system for a trucking fleet. Drivers start trips, carry sealed cargo locks, and release the steel cable seal ("cable") on a lock once the trip is finished. A driver who needs to abort a trip cannot cancel it directly: the request goes to a manager, who approves or rejects it, and the driver is notified of the outcome. The server is an Express API (`server/`), with a React driver app (`driver-app/`) and a React manager portal (`manager-portal/`).
