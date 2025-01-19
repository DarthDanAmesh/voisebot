"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

interface MathOperation {
  num1: number;
  operator: string;
  num2: number;
  result: number | string;
}

interface ApiResponse {
  text_response: string;
  math_operation: MathOperation | null;
}

// Custom hook for managing audio recording
const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      chunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        chunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        setAudioBlob(blob);

        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  return { isRecording, audioBlob, startRecording, stopRecording };
};

const VisualMathOperation: React.FC<{ operation: MathOperation }> = ({ operation }) => {
  const { num1, operator, num2, result } = operation;

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-center gap-4 mb-4">
        <span className="text-2xl font-bold">{num1}</span>
        <span className="text-xl">{operator}</span>
        <span className="text-2xl font-bold">{num2}</span>
        <span className="text-xl">=</span>
        <span className="text-2xl font-bold">{result}</span>
      </div>

      <ComparisonGame
        leftCount={num1}
        rightCount={num2}
        operator={operator}
        result={result}
      />
    </div>
  );
};

const AudioChatbot: React.FC = () => {
  const { isRecording, audioBlob, startRecording, stopRecording } = useAudioRecorder();
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioPlayer.current = new Audio();

    return () => {
      if (audioPlayer.current) {
        audioPlayer.current.pause();
        audioPlayer.current.src = '';
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!audioBlob) return;

    setIsProcessing(true);
    setError(null);
    const formData = new FormData();
    formData.append('audio', audioBlob);

    try {
      const result = await axios.post<ApiResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/process-audio`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          withCredentials: true,
        }
      );

      setResponse(result.data);

      if (audioPlayer.current && result.data.text_response) {
        // Create a speech synthesis utterance
        const utterance = new SpeechSynthesisUtterance(result.data.text_response);
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      setError('Failed to process audio. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Interactive Math Chatbot</h1>
        <p className="text-gray-600">Ask me any math question!</p>
      </header>

      <div className="flex flex-col items-center gap-6">
        <motion.button
          className={`px-6 py-3 rounded-full text-white font-semibold ${
            isRecording ? 'bg-red-500' : 'bg-blue-500'
          }`}
          whileTap={{ scale: 0.95 }}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </motion.button>

        {audioBlob && !isRecording && (
          <motion.button
            className="px-6 py-3 rounded-full bg-green-500 text-white font-semibold disabled:bg-gray-400"
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={isProcessing}
          >
            Send Question
          </motion.button>
        )}

        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-gray-600"
            >
              Processing your question...
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-500 text-center"
          >
            {error}
          </motion.div>
        )}

        {response && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Response:</h2>
              <p className="mb-4">{response.text_response}</p>

              {response.math_operation && (
                <VisualMathOperation operation={response.math_operation} />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AudioChatbot;