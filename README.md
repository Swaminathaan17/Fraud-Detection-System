# Fraud Detection System

A full-stack fraud detection application designed to analyze financial transactions and identify potentially fraudulent activities.

## Overview

The Fraud Detection System combines a Java-based fraud detection service with a modern web dashboard. It provides a structured way to process transaction data, perform fraud analysis, and present results through an easy-to-use interface.

## Features

- Transaction analysis
- Fraud detection and classification
- Transaction data management
- Fraud statistics and monitoring
- Web-based dashboard
- REST API
- Java-based fraud detection service
- TypeScript/React frontend
- API schema and generated API clients

## Project Structure

```text
Fraud-Detection-System/
├── artifacts/
│   ├── api-server/
│   └── fraudguard-dashboard/
├── lib/
│   ├── api-client-react/
│   ├── api-spec/
│   ├── api-zod/
│   └── db/
├── scripts/
├── services/
│   └── fraud-detection/
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

## Technologies Used

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Modern UI components

### Backend
- Java
- Spring Boot
- REST API
- Maven

### Database & API
- Drizzle ORM
- OpenAPI
- Zod
- Generated API clients

## Fraud Detection Service

The fraud detection service is located in:

```text
services/fraud-detection/
```

It contains the Java application responsible for processing transaction information and performing fraud detection.

## Dashboard

The web dashboard is located in:

```text
artifacts/fraudguard-dashboard/
```

It provides the user interface for interacting with the fraud detection system and viewing transaction-related information.

## API Server

The API server is located in:

```text
artifacts/api-server/
```

It provides the application backend and API routes used by the frontend.

## Getting Started

Clone the repository:

```bash
git clone https://github.com/Swaminathaan17/Fraud-Detection-System.git
```

Navigate to the project:

```bash
cd Fraud-Detection-System
```

Install the project dependencies using pnpm:

```bash
pnpm install
```

The Java fraud detection service can be built and run using Maven from its project directory.

```bash
cd services/fraud-detection
mvn spring-boot:run
```

## Project Purpose

This project demonstrates the development of a full-stack fraud detection application combining transaction processing, backend services, API integration, and a web-based dashboard.

## Future Enhancements

- Machine learning-based fraud prediction
- Real-time transaction monitoring
- Advanced fraud analytics
- User authentication and role management
- Improved reporting and visualization
- Automated alerts for suspicious transactions
