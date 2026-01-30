// MIGRATION EXAMPLE: How to replace complex image code with QuickCheckImageManager
// This file shows the BEFORE and AFTER for easy comparison

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Grid,
  Paper,
  Card,
  CardContent,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Divider,
  Chip
} from '@mui/material';
import { Close, PhotoCamera, Upload, CheckCircle, ArrowForward } from '@mui/icons-material';
import { ImageFieldDisplay } from './Image';
import { ImageUpload, PhotoType } from '../types/quickCheck';

// ===== BEFORE: Complex implementation (lines 1450-1650 in QuickCheck.tsx) =====
/*
<Grid item xs={12}>
  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
    <Typography variant="body1" sx={{ flexGrow: 1 }}>
      Dash Lights
    </Typography>
    <IconButton
      size="small"
      onClick={(e) => handleInfoClick(e, "With Vehicle Running what lights are on before we perform any services?")}
      sx={{ ml: 1 }}
    >
      <InfoIcon fontSize="small" />
    </IconButton>
  </Box>
  <Box
    sx={{
      border: '1px dashed #ccc',
      borderRadius: 2,
      width: '100%',
      aspectRatio: '4/1',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      mb: 2,
      overflow: 'hidden',
      bgcolor: 'grey.50',
    }}
  >
    {!form.dash_lights_photos.length ? (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          p: 2,
          width: '100%',
          height: '100%',
        }}
        onClick={() => dashLightsInputRef.current?.click()}
      >
        <CameraAltIcon sx={{ fontSize: 32, color: '#888', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          Click to upload dash light photos
        </Typography>
      </Box>
    ) : (
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            width: '100%',
            height: '100%',
            p: 2,
            overflowX: 'auto',
            '&::-webkit-scrollbar': {
              height: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#888',
              borderRadius: '4px',
              '&:hover': {
                background: '#555',
              },
            },
          }}
        >
          {form.dash_lights_photos
            .filter(photo => !photo.isDeleted)
            .map((photo, index) => {
              console.log(`Rendering dash light photo ${index}:`, photo);
              return (
                <Box
                  key={index}
                  sx={{
                    position: 'relative',
                    flex: '0 0 auto',
                    width: 'calc(25% - 12px)',
                    height: '100%',
                    cursor: 'pointer',
                    '&:hover': {
                      '& .overlay': {
                        opacity: 1,
                      },
                    },
                  }}
                  onClick={() => handleImageClick(form.dash_lights_photos.filter(p => !p.isDeleted), 'dash_lights_photos')}
                >
                  <Tooltip title="Click to view full size">
                    <img
                      src={photo.url || URL.createObjectURL(photo.file)}
                      alt={`Dash Light ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 4,
                      }}
                      onLoad={() => console.log(`Dash light image ${index} loaded successfully:`, photo.url)}
                      onError={(e) => {
                        console.error(`Failed to load dash light image ${index}:`, photo.url, e);
                      }}
                    />
                  </Box>
                );
              })}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default QuickCheckMigrationExample;