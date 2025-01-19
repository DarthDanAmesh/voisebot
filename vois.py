import io
import re
from typing import Optional

import ollama
import speech_recognition as sr
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from gtts import gTTS
from pydantic import BaseModel
# Add these imports at the top
import logging
from pathlib import Path
import tempfile

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js development
        "http://127.0.0.1:3000",
        "https://example.com"  # Add your production domain
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize Ollama client with streaming capabilities
client = ollama.AsyncClient()


class MathOperation(BaseModel):
    num1: int
    operator: str
    num2: int
    result: float | str


async def process_math_expression(text: str) -> Optional[MathOperation]:
    # Extract numbers and operator from text
    pattern = r'what is (\d+) ([+\-*/]) (\d+)'
    match = re.search(pattern, text.lower())

    if match:
        num1 = int(match.group(1))
        operator = match.group(2)
        num2 = int(match.group(3))

        try:
            # Calculate result
            if operator == '+':
                result = num1 + num2
            elif operator == '-':
                result = num1 - num2
            elif operator == '*':
                result = num1 * num2
            elif operator == '/':
                result = num1 / num2 if num2 != 0 else "undefined"

            return MathOperation(
                num1=num1,
                operator=operator,
                num2=num2,
                result=result
            )
        except Exception as e:
            print(f"Error processing math expression: {e}")
            return None

    return None


async def generate_audio_response(text: str) -> io.BytesIO:
    try:
        tts = gTTS(text=text)
        audio_bytes = io.BytesIO()
        tts.write_to_fp(audio_bytes)
        audio_bytes.seek(0)
        return audio_bytes
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating audio response: {str(e)}"
        )



# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@app.post("/api/process-audio")
async def process_audio(audio: UploadFile = File(...)):
    try:
        # Add content type validation with logging
        logger.debug(f"Received audio file with content type: {audio.content_type}")
        if not audio.content_type or 'audio' not in audio.content_type:
            logger.warning(f"Invalid content type: {audio.content_type}")
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Please upload an audio file."
            )

        # Create a temporary file to store the audio
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            # Read audio in chunks to handle large files
            while chunk := await audio.read(1024):
                temp_audio.write(chunk)
            temp_audio_path = temp_audio.name

        logger.debug(f"Saved audio to temporary file: {temp_audio_path}")

        # Convert audio to text
        try:
            recognizer = sr.Recognizer()
            with sr.AudioFile(temp_audio_path) as source:
                logger.debug("Recording audio from file")
                audio_data = recognizer.record(source)
                logger.debug("Attempting speech recognition")
                text = recognizer.recognize_google(audio_data)
                logger.info(f"Recognized text: {text}")
        except sr.UnknownValueError as e:
            logger.error(f"Speech recognition failed: {str(e)}")
            raise HTTPException(status_code=400, detail="Could not understand audio")
        except Exception as e:
            logger.error(f"Error in speech recognition: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Speech recognition error: {str(e)}")
        finally:
            # Clean up temporary file
            Path(temp_audio_path).unlink(missing_ok=True)

        # Process with Ollama
        try:
            logger.debug("Sending request to Ollama")
            response_stream = await client.generate(
                model="smol",
                prompt=text,
                stream=True
            )

            full_response = ""
            async for chunk in response_stream:
                if chunk.response:
                    full_response += chunk.response
            logger.debug(f"Ollama response: {full_response}")

        except Exception as e:
            logger.error(f"Ollama processing error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"AI processing error: {str(e)}")

        # Create response data
        response_data = {
            "text_response": full_response,
            "math_operation": None  # We'll add math processing later if needed
        }

        return JSONResponse(
            content=response_data,
            headers={
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "http://localhost:3000",
                "Access-Control-Allow-Credentials": "true"
            }
        )

    except Exception as e:
        logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )



# 3. Add health check endpoint for Next.js
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/audio/{response_id}")
async def get_audio_response(response_id: str):
    try:
        audio_bytes = await generate_audio_response("Test response")
        response = StreamingResponse(
            audio_bytes,
            media_type="audio/mpeg"
        )
        return response
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Error generating audio: {str(e)}"}
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=5000,  # Changed to match your frontend configuration
        log_level="info"
    )