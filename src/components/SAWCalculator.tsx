import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Play, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Employee, SAWResult } from "@/pages/Index";
import type { Criteria } from "@/types/database";

interface SAWCalculatorProps {
  employees: Employee[];
  onCalculate: (results: SAWResult[]) => void;
}

export const SAWCalculator = ({ employees, onCalculate }: SAWCalculatorProps) => {
  const [criteriaData, setCriteriaData] = useState<Criteria[]>([]);
  const [criteriaWeights, setCriteriaWeights] = useState<Record<string, number>>({});
  const [criteriaTypes, setCriteriaTypes] = useState<Record<string, string>>({});
  const [decisionMatrix, setDecisionMatrix] = useState<number[][]>([]);
  const [normalizedMatrix, setNormalizedMatrix] = useState<number[][]>([]);
  const [finalScores, setFinalScores] = useState<SAWResult[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load criteria from database
  const fetchCriteriaWeights = async () => {
    try {
      const { data, error } = await supabase
        .from('criteria')
        .select('*')
        .order('category', { ascending: true });
      
      if (error) {
        console.error('Error fetching criteria:', error);
        toast({
          title: "Error",
          description: "Gagal mengambil data kriteria dari database",
          variant: "destructive",
        });
        return;
      }

      if (!data || data.length === 0) {
        toast({
          title: "Warning",
          description: "Tidak ada kriteria yang ditemukan di database",
          variant: "destructive",
        });
        return;
      }

      const typedCriteria = data.map(criteria => ({
        ...criteria,
        type: criteria.type as 'Benefit' | 'Cost'
      }));

      setCriteriaData(typedCriteria);

      const weights: Record<string, number> = {};
      const types: Record<string, string> = {};
      
      const fieldMapping: Record<string, string> = {
        'Kualitas Kerja': 'kualitasKerja',
        'Tanggung Jawab': 'tanggungJawab',
        'Kuantitas Kerja': 'kuantitasKerja',
        'Pemahaman Tugas': 'pemahamanTugas',
        'Inisiatif': 'inisiatif',
        'Kerjasama': 'kerjasama',
        'Jumlah Hari Alpa': 'hariAlpa',
        'Jumlah Keterlambatan': 'keterlambatan',
        'Jumlah Hari Izin': 'hariIzin',
        'Jumlah Hari Sakit': 'hariSakit',
        'Pulang Cepat': 'pulangCepat',
        'Prestasi': 'prestasi',
        'Surat Peringatan': 'suratPeringatan'
      };
      
      typedCriteria.forEach((criteria) => {
        const fieldName = fieldMapping[criteria.name];
        if (fieldName) {
          // Convert percentage to decimal (0-1)
          weights[fieldName] = criteria.weight / 100;
          types[fieldName] = criteria.type;
        }
      });

      // Validate total weights = 1 (100%)
      const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      if (Math.abs(totalWeight - 1) > 0.01) {
        toast({
          title: "Warning",
          description: `Total bobot kriteria adalah ${(totalWeight * 100).toFixed(1)}%, seharusnya 100%`,
          variant: "destructive",
        });
      }

      setCriteriaWeights(weights);
      setCriteriaTypes(types);
      console.log('Loaded criteria from database:', typedCriteria.length);
      console.log('Mapped weights (converted to decimal):', weights);
      console.log('Total weight:', totalWeight);
      console.log('Mapped types:', types);
    } catch (error) {
      console.error('Network error fetching criteria:', error);
      toast({
        title: "Error",
        description: "Gagal terhubung ke database",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchCriteriaWeights();
  }, []);

  // Convert raw values to 1-5 scale based on criteria
  const convertToScale = (value: number, criterion: string): number => {
    // Performance criteria (1-5 scale from forms)
    const performanceCriteria = ['kualitasKerja', 'tanggungJawab', 'kuantitasKerja', 'pemahamanTugas', 'inisiatif', 'kerjasama'];
    
    if (performanceCriteria.includes(criterion)) {
      // Already in 1-5 scale, return as is
      return Math.max(1, Math.min(5, value));
    }
    
    // Count-based criteria - convert to 1-5 scale
    switch (criterion) {
      case 'hariAlpa':
        if (value === 0) return 5;
        if (value <= 2) return 4;
        if (value <= 5) return 3;
        if (value <= 10) return 2;
        return 1;
        
      case 'keterlambatan':
        if (value === 0) return 5;
        if (value <= 3) return 4;
        if (value <= 7) return 3;
        if (value <= 15) return 2;
        return 1;
        
      case 'hariIzin':
        if (value === 0) return 5;
        if (value <= 2) return 4;
        if (value <= 5) return 3;
        if (value <= 10) return 2;
        return 1;
        
      case 'hariSakit':
        if (value === 0) return 5;
        if (value <= 3) return 4;
        if (value <= 7) return 3;
        if (value <= 15) return 2;
        return 1;
        
      case 'pulangCepat':
        if (value === 0) return 5;
        if (value <= 2) return 4;
        if (value <= 5) return 3;
        if (value <= 10) return 2;
        return 1;
        
      case 'prestasi':
        if (value >= 5) return 5;
        if (value >= 3) return 4;
        if (value >= 2) return 3;
        if (value >= 1) return 2;
        return 1;
        
      case 'suratPeringatan':
        if (value === 0) return 5;
        if (value <= 1) return 4;
        if (value <= 2) return 3;
        if (value <= 3) return 2;
        return 1;
        
      default:
        return Math.max(1, Math.min(5, value));
    }
  };

  const calculateSAW = async () => {
    if (employees.length === 0) {
      toast({
        title: "Error",
        description: "Tidak ada data karyawan untuk dihitung",
        variant: "destructive",
      });
      return;
    }

    if (Object.keys(criteriaWeights).length === 0) {
      toast({
        title: "Error",
        description: "Data kriteria belum dimuat dari database",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("Starting SAW calculation for employees:", employees.length);
    console.log("Using criteria weights:", criteriaWeights);

    try {
      const allCriteria = [
        'kualitasKerja', 'tanggungJawab', 'kuantitasKerja', 'pemahamanTugas', 
        'inisiatif', 'kerjasama', 'hariAlpa', 'keterlambatan', 'hariIzin', 
        'hariSakit', 'pulangCepat', 'prestasi', 'suratPeringatan'
      ];

      const activeCriteria = allCriteria.filter(criterion => criteriaWeights[criterion] !== undefined);
      
      console.log("Active criteria for calculation:", activeCriteria);

      // Step 1: Create decision matrix with converted values (1-5 scale)
      const matrix = employees.map(emp => 
        activeCriteria.map(criterion => {
          const rawValue = emp[criterion as keyof Employee] as number;
          const convertedValue = convertToScale(rawValue, criterion);
          console.log(`${emp.name} - ${criterion}: ${rawValue} -> ${convertedValue}`);
          return convertedValue;
        })
      );

      console.log("Decision Matrix (converted to 1-5 scale):", matrix);
      setDecisionMatrix(matrix);

      // Step 2: Normalize matrix using correct SAW formulas
      const normalized = matrix.map(() => new Array(activeCriteria.length).fill(0));

      for (let j = 0; j < activeCriteria.length; j++) {
        const criterion = activeCriteria[j];
        const columnValues = matrix.map(row => row[j]);
        const criterionType = criteriaTypes[criterion] || 'Benefit';
        
        console.log(`Processing criterion ${criterion} (${criterionType}):`, columnValues);
        
        if (criterionType === 'Benefit') {
          // For Benefit criteria: Rij = Xij / max(Xij)
          const maxValue = Math.max(...columnValues);
          console.log(`Max value for ${criterion}:`, maxValue);
          
          if (maxValue > 0) {
            for (let i = 0; i < matrix.length; i++) {
              normalized[i][j] = matrix[i][j] / maxValue;
            }
          } else {
            // If all values are 0, set normalized values to 0
            for (let i = 0; i < matrix.length; i++) {
              normalized[i][j] = 0;
            }
          }
        } else {
          // For Cost criteria: Rij = min(Xij) / Xij
          const minValue = Math.min(...columnValues);
          console.log(`Min value for ${criterion}:`, minValue);
          
          for (let i = 0; i < matrix.length; i++) {
            if (matrix[i][j] > 0) {
              normalized[i][j] = minValue / matrix[i][j];
            } else {
              // Handle zero values for cost criteria
              normalized[i][j] = 1;
            }
          }
        }
      }

      console.log("Normalized Matrix:", normalized);
      setNormalizedMatrix(normalized);

      // Step 3: Calculate final scores using SAW formula: Vi = Σ(Wj × Rij)
      const weightValues = activeCriteria.map(key => criteriaWeights[key]);
      console.log("Weight values used:", weightValues);
      
      const results: SAWResult[] = employees.map((employee, index) => {
        const normalizedScores = normalized[index];
        const finalScore = normalizedScores.reduce((sum, score, j) => {
          const weightedScore = score * weightValues[j];
          console.log(`Employee ${employee.name}, criterion ${activeCriteria[j]}: ${score.toFixed(4)} * ${weightValues[j].toFixed(4)} = ${weightedScore.toFixed(4)}`);
          return sum + weightedScore;
        }, 0);

        console.log(`Final SAW score for ${employee.name}:`, finalScore);

        // Convert SAW score (0-1) to 1-5 scale using the specified rules
        const convertedScore = convertSAWScoreToScale(finalScore);
        
        // Check for automatic termination due to excessive absence
        const isAutoTerminated = employee.hariAlpa > 10;
        
        // Generate recommendation based on converted score and business rules
        const { recommendation, note } = getRecommendation(convertedScore, isAutoTerminated, employee.hariAlpa);

        return {
          employee,
          normalizedScores,
          finalScore,
          convertedScore,
          rank: 0, // Will be set after sorting
          recommendation,
          note
        };
      });

      // Step 4: Rank employees (excluding auto-terminated ones from ranking)
      const nonTerminatedResults = results.filter(r => r.employee.hariAlpa <= 10);
      const terminatedResults = results.filter(r => r.employee.hariAlpa > 10);
      
      // Sort by SAW score (finalScore) in descending order
      nonTerminatedResults.sort((a, b) => b.finalScore - a.finalScore);
      nonTerminatedResults.forEach((result, index) => {
        result.rank = index + 1;
      });
      
      // Assign special rank for terminated employees
      terminatedResults.forEach(result => {
        result.rank = 999; // Special rank for terminated employees
      });

      const finalResults = [...nonTerminatedResults, ...terminatedResults];

      console.log("Final SAW Results:", finalResults);
      setFinalScores(finalResults);
      setIsCalculated(true);
      onCalculate(finalResults);

      toast({
        title: "Berhasil",
        description: `Perhitungan SAW selesai menggunakan ${activeCriteria.length} kriteria`,
      });
    } catch (error) {
      console.error('Error in SAW calculation:', error);
      toast({
        title: "Error",
        description: "Terjadi kesalahan dalam perhitungan",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Convert SAW score (0-1) to 1-5 scale using specified ranges
  const convertSAWScoreToScale = (sawScore: number): number => {
    if (sawScore >= 0.85) return 5; // Sangat Baik
    if (sawScore >= 0.70) return 4; // Baik  
    if (sawScore >= 0.50) return 3; // Cukup
    if (sawScore >= 0.30) return 2; // Kurang
    return 1; // Sangat Kurang
  };

  const getRecommendation = (convertedScore: number, isAutoTerminated: boolean, absentDays: number): { recommendation: string; note?: string } => {
    if (isAutoTerminated) {
      return {
        recommendation: "Diberhentikan",
        note: `Otomatis diberhentikan karena alpa ${absentDays} hari (>10 hari)`
      };
    }
    
    // Use converted score (1-5 scale) for recommendations
    if (convertedScore >= 4) {
      return {
        recommendation: "Dapat diperpanjang",
        note: "Kandidat promosi"
      };
    } else if (convertedScore >= 3) {
      return {
        recommendation: "Dapat diperpanjang"
      };
    } else {
      return {
        recommendation: "Diberhentikan",
        note: "Tidak memenuhi standar kinerja minimum"
      };
    }
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 5) return "Sangat Baik";
    if (score >= 4) return "Baik";
    if (score >= 3) return "Cukup";
    if (score >= 2) return "Kurang";
    return "Sangat Kurang";
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <Calculator className="w-5 h-5" />
            Perhitungan Simple Additive Weighting (SAW)
          </CardTitle>
          <p className="text-gray-600">
            Proses perhitungan menggunakan metode SAW dengan normalisasi skala 1-5 untuk evaluasi kinerja karyawan
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Total karyawan: <span className="font-semibold">{employees.length}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Kriteria dimuat: <span className="font-semibold">{Object.keys(criteriaWeights).length}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Total kriteria di database: <span className="font-semibold">{criteriaData.length}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Total bobot: <span className="font-semibold">
                    {(Object.values(criteriaWeights).reduce((sum, weight) => sum + weight, 0) * 100).toFixed(1)}%
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  Status: {isCalculated ? (
                    <Badge variant="default" className="ml-1">Sudah dihitung</Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-1">Belum dihitung</Badge>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={fetchCriteriaWeights}
                  variant="outline"
                  disabled={loading}
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Muat Ulang Kriteria
                </Button>
                <Button 
                  onClick={calculateSAW}
                  disabled={employees.length === 0 || loading || Object.keys(criteriaWeights).length === 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {loading ? "Menghitung..." : "Hitung SAW"}
                </Button>
              </div>
            </div>

            {employees.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Calculator className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Tambahkan data evaluasi karyawan terlebih dahulu</p>
              </div>
            )}

            {Object.keys(criteriaWeights).length === 0 && criteriaData.length === 0 && (
              <div className="text-center py-4 text-orange-600 bg-orange-50 rounded-lg">
                <p>Kriteria belum dimuat dari database. Pastikan ada kriteria di database dan klik "Muat Ulang Kriteria".</p>
              </div>
            )}

            {criteriaData.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Kriteria yang Dimuat dari Database:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {criteriaData.map((criteria, index) => (
                    <div key={criteria.id} className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>{criteria.name}</span>
                      <span className="text-gray-600">
                        {criteria.type} - Bobot: {criteria.weight}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SAW Formula Info */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
              <h5 className="font-semibold mb-2">Rumus SAW (Simple Additive Weighting):</h5>
              <div className="space-y-1 text-xs">
                <p><strong>1. Konversi ke Skala 1-5:</strong> Semua nilai dikonversi ke skala 1-5</p>
                <p><strong>2. Normalisasi Benefit:</strong> Rij = Xij / max(Xij)</p>
                <p><strong>3. Normalisasi Cost:</strong> Rij = min(Xij) / Xij</p>
                <p><strong>4. Skor Akhir:</strong> Vi = Σ(Wj × Rij)</p>
                <p><strong>5. Konversi Skor SAW ke Skala Formulir:</strong></p>
                <p className="ml-4">• 0.85-1.00 = 5 (Sangat Baik)</p>
                <p className="ml-4">• 0.70-0.84 = 4 (Baik)</p>
                <p className="ml-4">• 0.50-0.69 = 3 (Cukup)</p>
                <p className="ml-4">• 0.30-0.49 = 2 (Kurang)</p>
                <p className="ml-4">• 0.00-0.29 = 1 (Sangat Kurang)</p>
              </div>
            </div>

            {/* Auto termination warning */}
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Aturan Pemberhentian Otomatis:</p>
                <p className="text-red-700">Karyawan dengan alpa lebih dari 10 hari akan otomatis diberhentikan</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decision Matrix */}
      {decisionMatrix.length > 0 && (
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-gray-800">
              Langkah 1: Matriks Keputusan (X) - Konversi ke Skala 1-5
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Karyawan</th>
                    {Object.keys(criteriaWeights).map((criterion, index) => (
                      <th key={criterion} className="text-center py-2 px-2">C{index + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee, index) => (
                    <tr key={employee.id} className="border-b">
                      <td className="py-2 px-2 font-medium">{employee.name}</td>
                      {decisionMatrix[index].map((value, j) => (
                        <td key={j} className="text-center py-2 px-2">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Semua nilai telah dikonversi ke skala 1-5 berdasarkan jenis kriteria masing-masing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Normalized Matrix */}
      {normalizedMatrix.length > 0 && (
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-gray-800">
              Langkah 2: Matriks Ternormalisasi (R)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm">
              <p><strong>Rumus Normalisasi SAW:</strong></p>
              <p>• Benefit: Rij = Xij / max(Xij)</p>
              <p>• Cost: Rij = min(Xij) / Xij</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Karyawan</th>
                    {Object.keys(criteriaWeights).map((criterion, index) => (
                      <th key={criterion} className="text-center py-2 px-2">C{index + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee, index) => (
                    <tr key={employee.id} className="border-b">
                      <td className="py-2 px-2 font-medium">{employee.name}</td>
                      {normalizedMatrix[index].map((value, j) => (
                        <td key={j} className="text-center py-2 px-2">
                          {value.toFixed(4)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Scores */}
      {finalScores.length > 0 && (
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg text-gray-800">
              Langkah 3: Perhitungan Nilai Akhir SAW (V)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 bg-green-50 rounded-lg text-sm">
              <p><strong>Rumus SAW:</strong> Vi = Σ(Wj × Rij)</p>
              <p>Dimana Wj adalah bobot kriteria dan Rij adalah nilai ternormalisasi</p>
              <p><strong>Konversi Skor SAW (0-1) ke Skala Formulir (1-5):</strong></p>
              <p>• 0.85-1.00 = 5, • 0.70-0.84 = 4, • 0.50-0.69 = 3, • 0.30-0.49 = 2, • 0.00-0.29 = 1</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Rank</th>
                    <th className="text-left py-3 px-4">Nama</th>
                    <th className="text-center py-3 px-4">Skor SAW (Vi)</th>
                    <th className="text-center py-3 px-4">Skor Skala</th>
                    <th className="text-center py-3 px-4">Kategori</th>
                    <th className="text-left py-3 px-4">Rekomendasi</th>
                  </tr>
                </thead>
                <tbody>
                  {finalScores.map((result) => (
                    <tr key={result.employee.id} className={`border-b hover:bg-gray-50 ${
                      result.employee.hariAlpa > 10 ? 'bg-red-50' : ''
                    }`}>
                      <td className="py-3 px-4">
                        {result.rank === 999 ? (
                          <Badge variant="destructive">AUTO</Badge>
                        ) : (
                          <Badge variant={result.rank === 1 ? "default" : "secondary"}>
                            #{result.rank}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          {result.note && (
                            <p className="text-xs text-gray-600 mt-1">{result.note}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};results.employee.name}
                          {result.employee.hariAlpa > 10 && (
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                          )}
                        </div>
                      </td>
                      <td className="text-center py-3 px-4 font-mono">
                        {result.finalScore.toFixed(4)}
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge 
                          variant={result.convertedScore >= 3 && result.employee.hariAlpa <= 10 ? "default" : "destructive"}
                          className="font-bold"
                        >
                          {result.convertedScore}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="text-sm text-gray-600">
                          {getScoreLabel(result.convertedScore)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <Badge 
                            variant={result.recommendation === "Dapat diperpanjang" ? "default" : "destructive"}
                            className="mb-1"
                          >
                            {result.recommendation}
                          </Badge>
                          {result.note && (
                            <p className="text-xs text-gray-600 mt-1">{result.note}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};