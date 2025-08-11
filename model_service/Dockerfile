FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Python + pip
RUN apt-get update && apt-get install -y python3 python3-pip
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY requirements.txt .

# upgrade pip i instalacja torch z CUDA
RUN pip3 install --upgrade pip
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# instalacja reszty pakietów z requirements.txt bez torch i torchvision itp.
RUN grep -vE "torch|torchvision|torchaudio" requirements.txt > requirements_no_torch.txt
RUN pip3 install -r requirements_no_torch.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

EXPOSE 8001
